import { fireEvent, screen } from "@testing-library/react-native";

import LoginScreen from "@/app/(auth)/login";
import { FACEBOOK_CANCELLED } from "@/lib/socialSignIn";
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

describe("LoginScreen Facebook, window closed", () => {
  beforeEach(resetFacebookHarness);

  it("says so calmly and leaves every way in tappable", async () => {
    fb.startSSOFlow.mockResolvedValue({
      createdSessionId: null,
      authSessionResult: { type: "cancel" },
    });
    await renderInSafeArea(<LoginScreen />);

    fireEvent.press(screen.getByLabelText("Continue with Facebook"));

    expect(await screen.findByText(FACEBOOK_CANCELLED)).toBeTruthy();
    expect(screen.queryByText("Could not sign in")).toBeNull();
    expect(useSession.getState().ssoInFlight).toBe(false);
    expect(screen.getByLabelText("Continue with Facebook").props.accessibilityState).toEqual({
      disabled: false,
    });
    expect(fb.push).not.toHaveBeenCalled();
  });
});
