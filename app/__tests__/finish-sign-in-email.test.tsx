import { fireEvent, screen } from "@testing-library/react-native";

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

/** Facebook shared no email: add one, and a code is sent to it. */
describe("FinishSignInScreen, email for a new account", () => {
  beforeEach(resetFacebookHarness);

  it("adds the email to the sign-up and sends its code", async () => {
    useSocialFinish.setState({ contact: "Ana@Example.com " });
    await renderInSafeArea(<FinishSignInScreen />);
    expect(screen.getByText("One more step")).toBeTruthy();
    expect(screen.getByText("GRIDGO never posts to your Facebook.")).toBeTruthy();

    fireEvent.press(screen.getByRole("button", { name: "Send code" }));

    expect(await screen.findByText("Enter the code")).toBeTruthy();
    expect(fb.signUp.update).toHaveBeenCalledWith({ emailAddress: "ana@example.com" });
    expect(fb.signUp.verifications.sendEmailCode).toHaveBeenCalled();
    expect(fb.signIn.create).not.toHaveBeenCalled();
    expect(useSession.getState().user).toBeNull();
  });
});
