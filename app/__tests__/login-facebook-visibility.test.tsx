import { screen } from "@testing-library/react-native";

import LoginScreen from "@/app/(auth)/login";
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

describe("LoginScreen Facebook button", () => {
  beforeEach(resetFacebookHarness);

  it("is not drawn while Clerk does not offer Facebook", async () => {
    fb.offered = false;
    await renderInSafeArea(<LoginScreen />);

    expect(screen.queryByLabelText("Continue with Facebook")).toBeNull();
    expect(screen.getByLabelText("Continue with Google")).toBeTruthy();
  });

  it("is drawn first, before Google, once Clerk offers Facebook", async () => {
    await renderInSafeArea(<LoginScreen />);

    const providers = screen
      .getAllByRole("button")
      .map((button) => button.props.accessibilityLabel as string | undefined)
      .filter((label) => label?.startsWith("Continue with"));
    expect(providers[0]).toBe("Continue with Facebook");
    expect(providers.indexOf("Continue with Google")).toBeGreaterThan(0);
  });
});
