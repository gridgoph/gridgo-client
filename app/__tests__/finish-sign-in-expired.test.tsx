import { screen } from "@testing-library/react-native";

import FinishSignInScreen from "@/app/(auth)/finish-sign-in";
import { useSession } from "@/store/session";
import { useSocialFinish } from "@/store/socialFinish";
import { fb, renderInSafeArea, resetFacebookHarness } from "@/test/facebookSignIn";

/* eslint-disable @typescript-eslint/no-require-imports */
jest.mock("@clerk/expo", () => require("@/test/facebookSignIn").clerkExpoMock);
jest.mock("@clerk/expo/experimental", () => require("@/test/facebookSignIn").experimentalMock);
jest.mock("expo-router", () => require("@/test/facebookSignIn").routerMock);
jest.mock("expo-router/react-navigation", () => ({ usePreventRemove: jest.fn() }));
jest.mock("@/lib/api", () => require("@/test/facebookSignIn").apiMock());
/* eslint-enable @typescript-eslint/no-require-imports */

describe("FinishSignInScreen, nothing left to finish", () => {
  beforeEach(resetFacebookHarness);

  it("says the attempt expired and offers the way back, never a dead end", async () => {
    fb.signUp.status = "abandoned";
    await renderInSafeArea(<FinishSignInScreen />);

    expect(screen.getByText("Let's start again")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Back to sign in" })).toBeTruthy();
    expect(useSession.getState().user).toBeNull();
    expect(useSocialFinish.getState().step).toBe("contact");
  });

  it("sends the link code when Clerk wants the shared email confirmed", async () => {
    fb.signUp.status = "abandoned";
    fb.signIn.status = "needs_first_factor";
    fb.signIn.identifier = "ana@example.com";
    fb.signIn.supportedFirstFactors = [{ strategy: "email_code" }];
    await renderInSafeArea(<FinishSignInScreen />);

    expect(await screen.findByText("Confirm it's you")).toBeTruthy();
    expect(fb.signIn.emailCode.sendCode).toHaveBeenCalled();
  });
});
