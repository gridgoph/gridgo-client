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

describe("FinishSignInScreen, code for an existing account", () => {
  beforeEach(resetFacebookHarness);

  it("signs in to the existing GRIDGO person and finishes no sign-up", async () => {
    fb.signIn.emailCode.verifyCode.mockImplementation(async () => {
      fb.signIn.status = "complete";
      return { error: null };
    });
    useSocialFinish.setState({
      step: "code",
      kind: "email",
      contact: "ana@example.com",
      existing: true,
      code: "654321",
    });
    await renderInSafeArea(<FinishSignInScreen />);

    fireEvent.press(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => expect(useSession.getState().user?.id).toBe(existingClient.id));
    expect(fb.signIn.emailCode.verifyCode).toHaveBeenCalledWith({ code: "654321" });
    expect(fb.signIn.finalize).toHaveBeenCalled();
    expect(fb.signUp.finalize).not.toHaveBeenCalled();
    expect(fb.activate).not.toHaveBeenCalled();
  });
});
