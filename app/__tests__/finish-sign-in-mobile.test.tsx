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

/** A phone-only Facebook account may give a mobile number instead. */
describe("FinishSignInScreen, mobile for a new account", () => {
  beforeEach(resetFacebookHarness);

  it("offers email or mobile, and sends the code to the mobile in +63 form", async () => {
    useSocialFinish.setState({ kind: "phone", contact: "0917 123 4567" });
    await renderInSafeArea(<FinishSignInScreen />);
    expect(screen.getByRole("radio", { name: "Email" })).toBeTruthy();
    expect(screen.getByLabelText("Mobile number")).toBeTruthy();

    fireEvent.press(screen.getByRole("button", { name: "Send code" }));

    expect(await screen.findByText("Enter the code")).toBeTruthy();
    expect(fb.signUp.update).toHaveBeenCalledWith({ phoneNumber: "+639171234567" });
    expect(fb.signUp.verifications.sendPhoneCode).toHaveBeenCalled();
  });
});
