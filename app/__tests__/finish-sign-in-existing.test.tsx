import { fireEvent, screen } from "@testing-library/react-native";

import FinishSignInScreen from "@/app/(auth)/finish-sign-in";
import { useSocialFinish } from "@/store/socialFinish";
import { fb, renderInSafeArea, resetFacebookHarness } from "@/test/facebookSignIn";

/* eslint-disable @typescript-eslint/no-require-imports */
jest.mock("@clerk/expo", () => require("@/test/facebookSignIn").clerkExpoMock);
jest.mock("@clerk/expo/experimental", () => require("@/test/facebookSignIn").experimentalMock);
jest.mock("expo-router", () => require("@/test/facebookSignIn").routerMock);
jest.mock("expo-router/react-navigation", () => ({ usePreventRemove: jest.fn() }));
jest.mock("@/lib/api", () => require("@/test/facebookSignIn").apiMock());
/* eslint-enable @typescript-eslint/no-require-imports */

/**
 * The email typed already belongs to a GRIDGO person. Clerk refuses it on the
 * sign-up, so the code goes to that account and signs in to it instead.
 */
describe("FinishSignInScreen, email that already has an account", () => {
  beforeEach(resetFacebookHarness);

  it("sends a sign-in code to the existing account rather than making a second one", async () => {
    fb.signUp.update.mockResolvedValue({
      error: { errors: [{ code: "form_identifier_exists", message: "That email address is taken." }] },
    });
    useSocialFinish.setState({ contact: "ana@example.com" });
    await renderInSafeArea(<FinishSignInScreen />);

    fireEvent.press(screen.getByRole("button", { name: "Send code" }));

    expect(await screen.findByText("Welcome back")).toBeTruthy();
    expect(fb.signIn.create).toHaveBeenCalledWith({ identifier: "ana@example.com" });
    expect(fb.signIn.emailCode.sendCode).toHaveBeenCalled();
    expect(fb.signUp.verifications.sendEmailCode).not.toHaveBeenCalled();
    expect(screen.queryByText("Could not send the code")).toBeNull();
  });
});
