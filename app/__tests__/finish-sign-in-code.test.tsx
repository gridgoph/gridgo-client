import { fireEvent, screen, waitFor } from "@testing-library/react-native";

import FinishSignInScreen from "@/app/(auth)/finish-sign-in";
import { useSession } from "@/store/session";
import { useSocialFinish } from "@/store/socialFinish";
import { existingClient, fb, renderInSafeArea, resetFacebookHarness } from "@/test/facebookSignIn";

/* eslint-disable @typescript-eslint/no-require-imports */
jest.mock("@clerk/expo", () => require("@/test/facebookSignIn").clerkExpoMock);
jest.mock("@clerk/expo/experimental", () => require("@/test/facebookSignIn").experimentalMock);
jest.mock("expo-router", () => require("@/test/facebookSignIn").routerMock);
jest.mock("expo-router/react-navigation", () => ({ usePreventRemove: jest.fn() }));
jest.mock("@/lib/api", () => require("@/test/facebookSignIn").apiMock());
/* eslint-enable @typescript-eslint/no-require-imports */

/** The six-digit code finishes the new account and joins it to GRIDGO. */
describe("FinishSignInScreen, code for a new account", () => {
  beforeEach(resetFacebookHarness);

  it("verifies the code, finishes the sign-up and adopts the client", async () => {
    fb.signUp.verifications.verifyEmailCode.mockImplementation(async () => {
      fb.signUp.status = "complete";
      fb.signUp.missingFields = [];
      return { error: null };
    });
    useSocialFinish.setState({
      step: "code",
      kind: "email",
      contact: "ana@example.com",
      existing: false,
      code: "123456",
    });
    await renderInSafeArea(<FinishSignInScreen />);
    expect(screen.getByText("We sent a six-digit code to ana@example.com.")).toBeTruthy();

    fireEvent.press(screen.getByRole("button", { name: "Verify and continue" }));

    await waitFor(() => expect(useSession.getState().user?.id).toBe(existingClient.id));
    expect(fb.signUp.verifications.verifyEmailCode).toHaveBeenCalledWith({ code: "123456" });
    expect(fb.signUp.finalize).toHaveBeenCalled();
  });
});
