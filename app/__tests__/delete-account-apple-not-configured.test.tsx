import { fireEvent, screen, waitFor } from "@testing-library/react-native";

import DeleteAccountScreen from "@/app/delete-account";
import { ApiError, createPrivacyRequest, fileAccountDeletionRequest, revokeAppleAuthorization } from "@/lib/api";
import { appleAuthorizationCode } from "@/lib/appleReauth";
import { appleRevocationFailure, APPLE_REVOKED } from "@/lib/appleRevocation";
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
 * A deployment without the Apple key: said plainly, the request kept, and no
 * button that cannot help. One press per file.
 */
it("says Apple could not be disconnected when it is not configured", async () => {
  (createPrivacyRequest as jest.Mock).mockResolvedValue({ id: "prq_1", kind: "deletion", status: "pending", requestedAt: "2026-10-21T02:00:00.000Z", dueAt: "2026-11-20T02:00:00.000Z" });
  (fileAccountDeletionRequest as jest.Mock).mockResolvedValue(undefined);
  (appleAuthorizationCode as jest.Mock).mockResolvedValue("fresh-code");
  (revokeAppleAuthorization as jest.Mock).mockRejectedValue(new ApiError(503, { error: "apple_revocation_not_configured" }));
  await renderScreen(<DeleteAccountScreen />);

  fireEvent.changeText(screen.getByLabelText("Your password"), "secret-pass");
  await waitFor(() => expect(screen.getByLabelText("Your password").props.value).toBe("secret-pass"));
  fireEvent.press(screen.getByRole("button", { name: "Delete my account" }));

  const expected = appleRevocationFailure("apple_revocation_not_configured");
  if (expected.status !== "failed") throw new Error("unreachable");
  expect(await screen.findByText(expected.message)).toBeTruthy();
  expect(screen.getByText("Request sent")).toBeTruthy();
  expect(screen.getByText("Apple still connected")).toBeTruthy();
  expect(screen.queryByText(APPLE_REVOKED)).toBeNull();
  expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Sign in with Apple" })).toBeNull();
});
