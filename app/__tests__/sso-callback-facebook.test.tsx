import { waitFor } from "@testing-library/react-native";

import SsoCallbackScreen from "@/app/sso-callback";
import { useSession } from "@/store/session";
import { fb, renderInSafeArea, resetFacebookHarness } from "@/test/facebookSignIn";

/* eslint-disable @typescript-eslint/no-require-imports */
jest.mock("@clerk/expo", () => require("@/test/facebookSignIn").clerkExpoMock);
jest.mock("@clerk/expo/experimental", () => require("@/test/facebookSignIn").experimentalMock);
jest.mock("expo-router", () => require("@/test/facebookSignIn").routerMock);
jest.mock("expo-router/react-navigation", () => ({ usePreventRemove: jest.fn() }));
jest.mock("@/lib/api", () => require("@/test/facebookSignIn").apiMock());
/* eslint-enable @typescript-eslint/no-require-imports */

/**
 * Android hands the Facebook return to the native callback. A Facebook
 * account with no email has nothing to activate yet, so the callback must
 * open the finish step instead of holding "Signing you in" for ever.
 */
describe("SsoCallbackScreen, Facebook shared no email", () => {
  beforeEach(resetFacebookHarness);

  it("sends the person to add an email or mobile", async () => {
    fb.params = { rotating_token_nonce: "nonce_1" };
    fb.signIn.firstFactorVerification.status = "transferable";
    fb.signIn.reload.mockResolvedValue(fb.signIn);
    await renderInSafeArea(<SsoCallbackScreen />);

    await waitFor(() => expect(fb.redirect).toHaveBeenCalledWith("/(auth)/finish-sign-in"));
    expect(fb.signUp.create).toHaveBeenCalledWith({ transfer: true });
    expect(useSession.getState().ssoInFlight).toBe(false);
    expect(useSession.getState().user).toBeNull();
  });
});
