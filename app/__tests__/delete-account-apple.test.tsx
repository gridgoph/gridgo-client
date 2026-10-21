import { fireEvent, screen, waitFor } from "@testing-library/react-native";

import DeleteAccountScreen from "@/app/delete-account";
import { createPrivacyRequest, fileAccountDeletionRequest, revokeAppleAuthorization } from "@/lib/api";
import { appleAuthorizationCode } from "@/lib/appleReauth";
import { APPLE_REVOKED } from "@/lib/appleRevocation";
import { renderScreen } from "@/test/renderScreen";

jest.mock("expo-router", () => ({ router: { push: jest.fn(), back: jest.fn() } }));
jest.mock("@/lib/api", () => ({
  ApiError: jest.requireActual("@/lib/api").ApiError,
  createPrivacyRequest: jest.fn(),
  fileAccountDeletionRequest: jest.fn(),
  getAccountDeletionRequest: jest.fn(async () => ({ id: "req_1", status: "pending", appleRevocations: [] })),
  recoverUnauthorizedSession: jest.fn(),
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
      id: "user_clerk_apple",
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
 * An Apple-linked iPhone account: the request is sent, Apple is asked once
 * more, and the disconnection is said only once the API answered revoked.
 * One press per test file (see AGENTS.md).
 */
it("sends the request, then disconnects Sign in with Apple and says so", async () => {
  (createPrivacyRequest as jest.Mock).mockResolvedValue({ id: "prq_1", kind: "deletion", status: "pending", requestedAt: "2026-10-21T02:00:00.000Z", dueAt: "2026-11-20T02:00:00.000Z" });
  (fileAccountDeletionRequest as jest.Mock).mockResolvedValue(undefined);
  (appleAuthorizationCode as jest.Mock).mockResolvedValue("fresh-code");
  (revokeAppleAuthorization as jest.Mock).mockResolvedValue({
    ok: true,
    requestId: "req_1",
    appleRevocation: { clientId: "ph.gridgo.client", status: "revoked", attemptedAt: "x", revokedAt: "x", error: null },
  });
  await renderScreen(<DeleteAccountScreen />);

  // Said before anything is sent, so Apple's sheet is not a surprise.
  expect(screen.getByText(/Apple asks you to sign in once more/)).toBeTruthy();

  fireEvent.changeText(screen.getByLabelText("Your password"), "secret-pass");
  await waitFor(() => expect(screen.getByLabelText("Your password").props.value).toBe("secret-pass"));
  fireEvent.press(screen.getByRole("button", { name: "Delete my account" }));

  expect(await screen.findByText(APPLE_REVOKED)).toBeTruthy();
  expect(screen.getByText("Request sent")).toBeTruthy();
  expect(screen.getByText("Disconnected")).toBeTruthy();
  expect(revokeAppleAuthorization).toHaveBeenCalledWith("ph.gridgo.client", "fresh-code");
  expect(appleAuthorizationCode).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole("button", { name: "Sign in with Apple" })).toBeNull();
});
