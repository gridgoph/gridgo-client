import { fireEvent, screen, waitFor } from "@testing-library/react-native";

import DeleteAccountScreen from "@/app/delete-account";
import { createPrivacyRequest, fileAccountDeletionRequest, revokeAppleAuthorization } from "@/lib/api";
import { appleAuthorizationCode } from "@/lib/appleReauth";
import { APPLE_CANCELLED } from "@/lib/appleRevocation";
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

/** Closing Apple's sheet never cancels the deletion request. One press per file. */
it("keeps the request and offers Apple again when the sheet is closed", async () => {
  (createPrivacyRequest as jest.Mock).mockResolvedValue({ id: "prq_1", kind: "deletion", status: "pending", requestedAt: "2026-10-21T02:00:00.000Z", dueAt: "2026-11-20T02:00:00.000Z" });
  (fileAccountDeletionRequest as jest.Mock).mockResolvedValue(undefined);
  (appleAuthorizationCode as jest.Mock).mockRejectedValue({ code: "ERR_REQUEST_CANCELED" });
  await renderScreen(<DeleteAccountScreen />);

  fireEvent.changeText(screen.getByLabelText("Your password"), "secret-pass");
  await waitFor(() => expect(screen.getByLabelText("Your password").props.value).toBe("secret-pass"));
  fireEvent.press(screen.getByRole("button", { name: "Delete my account" }));

  expect(await screen.findByText(APPLE_CANCELLED)).toBeTruthy();
  expect(screen.getByText("Request sent")).toBeTruthy();
  expect(screen.getByText("GRIDGO will answer by 20 Nov 2026.")).toBeTruthy();
  expect(screen.getByText("Apple still connected")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Sign in with Apple" })).toBeTruthy();
  expect(screen.queryByText("Disconnected")).toBeNull();
  expect(revokeAppleAuthorization).not.toHaveBeenCalled();
});
