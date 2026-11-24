import { fireEvent, screen } from "@testing-library/react-native";

import LoginScreen from "@/app/(auth)/login";
import { FACEBOOK_UNAVAILABLE } from "@/lib/socialSignIn";
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

describe("LoginScreen Facebook, connection unavailable", () => {
  beforeEach(resetFacebookHarness);

  it("points at the ways in that still work", async () => {
    fb.startSSOFlow.mockRejectedValue({
      errors: [{ code: "oauth_provider_not_enabled", message: "oauth_facebook is not enabled" }],
    });
    await renderInSafeArea(<LoginScreen />);

    fireEvent.press(screen.getByLabelText("Continue with Facebook"));

    expect(await screen.findByText(FACEBOOK_UNAVAILABLE)).toBeTruthy();
    expect(screen.getByLabelText("Continue with Google")).toBeTruthy();
  });
});
