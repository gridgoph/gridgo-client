import { fireEvent, screen, waitFor } from "@testing-library/react-native";

import LoginScreen from "@/app/(auth)/login";
import { useSession } from "@/store/session";
import { existingClient, fb, renderInSafeArea, resetFacebookHarness } from "@/test/facebookSignIn";

/* eslint-disable @typescript-eslint/no-require-imports */
jest.mock("@clerk/expo", () => require("@/test/facebookSignIn").clerkExpoMock);
jest.mock("@clerk/expo/experimental", () => require("@/test/facebookSignIn").experimentalMock);
jest.mock("@clerk/expo/apple", () => ({
  useSignInWithApple: () => ({ startAppleAuthenticationFlow: jest.fn() }),
}));
jest.mock("expo-router", () => require("@/test/facebookSignIn").routerMock);
jest.mock("expo-router/react-navigation", () => ({ usePreventRemove: jest.fn() }));
jest.mock("@/lib/api", () => require("@/test/facebookSignIn").apiMock());
/* eslint-enable @typescript-eslint/no-require-imports */

/**
 * Facebook shared a verified email that already belongs to a GRIDGO person.
 * Clerk's account linking signs that person in (one Clerk user), and the app's
 * ordinary me/activate join lands them in their existing account — no second
 * GRIDGO user is ever created.
 */
describe("LoginScreen Facebook, email returned", () => {
  beforeEach(resetFacebookHarness);

  it("lands an existing person in their own account", async () => {
    fb.startSSOFlow.mockResolvedValue({
      createdSessionId: "sess_facebook",
      authSessionResult: { type: "success" },
    });
    await renderInSafeArea(<LoginScreen />);

    fireEvent.press(screen.getByLabelText("Continue with Facebook"));

    await waitFor(() => expect(useSession.getState().user?.id).toBe(existingClient.id));
    expect(fb.startSSOFlow).toHaveBeenCalledWith({ strategy: "oauth_facebook" });
    expect(fb.setActive).toHaveBeenCalledWith({ session: "sess_facebook" });
    // The existing projection answered: nothing was enrolled a second time.
    expect(fb.activate).not.toHaveBeenCalled();
    expect(fb.push).not.toHaveBeenCalled();
  });
});
