import { fireEvent, screen, waitFor } from "@testing-library/react-native";

import LoginScreen from "@/app/(auth)/login";
import { useSession } from "@/store/session";
import { fb, renderInSafeArea, resetFacebookHarness } from "@/test/facebookSignIn";

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

describe("LoginScreen Facebook, no email shared", () => {
  beforeEach(resetFacebookHarness);

  it("opens the finish step instead of leaving the person on a wait", async () => {
    fb.startSSOFlow.mockResolvedValue({
      createdSessionId: null,
      authSessionResult: { type: "success" },
      signUp: fb.signUp,
      signIn: fb.signIn,
    });
    await renderInSafeArea(<LoginScreen />);

    fireEvent.press(screen.getByLabelText("Continue with Facebook"));

    await waitFor(() => expect(fb.push).toHaveBeenCalledWith("/(auth)/finish-sign-in"));
    expect(useSession.getState().user).toBeNull();
    expect(useSession.getState().sessionWait).toBeNull();
  });
});
