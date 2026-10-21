import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import { Platform } from "react-native";

import DeleteAccountScreen from "@/app/delete-account";
import { createPrivacyRequest, fileAccountDeletionRequest, revokeAppleAuthorization } from "@/lib/api";
import { appleAuthorizationCode } from "@/lib/appleReauth";
import { renderScreen } from "@/test/renderScreen";

jest.mock("expo-router", () => ({ router: { push: jest.fn(), back: jest.fn() } }));
jest.mock("@/lib/api", () => ({
  ApiError: jest.requireActual("@/lib/api").ApiError,
  createPrivacyRequest: jest.fn(),
  fileAccountDeletionRequest: jest.fn(),
  revokeAppleAuthorization: jest.fn(),
}));
jest.mock("@/lib/appleReauth", () => ({ appleAuthorizationCode: jest.fn() }));

const mockStart = jest.fn(async () => ({ status: "needs_first_factor" }));
const mockAttempt = jest.fn(async () => ({ status: "complete" }));
const mockPrepare = jest.fn();

jest.mock("@clerk/expo", () => ({
  useUser: () => ({
    isLoaded: true,
    user: {
      passwordEnabled: true,
      primaryEmailAddress: { emailAddress: "client@example.com" },
      externalAccounts: [{ provider: "apple" }],
    },
  }),
  useSession: () => ({
    session: {
      startVerification: mockStart,
      prepareFirstFactorVerification: mockPrepare,
      attemptFirstFactorVerification: mockAttempt,
    },
  }),
}));

/**
 * Android has no Apple sign-in: an Apple-linked account deletes exactly as it
 * always did. One press per file.
 */
it("sends the request on Android with no Apple step", async () => {
  jest.replaceProperty(Platform, "OS", "android");
  (createPrivacyRequest as jest.Mock).mockResolvedValue({ id: "prq_1", kind: "deletion", status: "pending", requestedAt: "2026-10-21T02:00:00.000Z", dueAt: "2026-11-20T02:00:00.000Z" });
  await renderScreen(<DeleteAccountScreen />);

  expect(screen.queryByText(/Apple asks you to sign in once more/)).toBeNull();

  fireEvent.changeText(screen.getByLabelText("Your password"), "secret-pass");
  await waitFor(() => expect(screen.getByLabelText("Your password").props.value).toBe("secret-pass"));
  fireEvent.press(screen.getByRole("button", { name: "Delete my account" }));

  expect(await screen.findByText("Request sent")).toBeTruthy();
  expect(screen.queryByText("SIGN IN WITH APPLE")).toBeNull();
  expect(createPrivacyRequest).toHaveBeenCalledTimes(1);
  expect(fileAccountDeletionRequest).not.toHaveBeenCalled();
  expect(appleAuthorizationCode).not.toHaveBeenCalled();
  expect(revokeAppleAuthorization).not.toHaveBeenCalled();
});
