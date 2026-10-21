import {
  ApiError,
  createPrivacyRequest,
  fileAccountDeletionRequest,
  revokeAppleAuthorization,
} from "@/lib/api";
import { appleAuthorizationCode } from "@/lib/appleReauth";
import {
  APPLE_CANCELLED,
  APPLE_NO_ANSWER,
  APPLE_PREPARE_FAILED,
  APPLE_REVOCATION_ATTEMPTS,
  appleRevocationFailure,
} from "@/lib/appleRevocation";
import { useAccountDeletion } from "@/store/accountDeletion";

jest.mock("@/lib/api", () => ({
  ApiError: jest.requireActual("@/lib/api").ApiError,
  createPrivacyRequest: jest.fn(),
  fileAccountDeletionRequest: jest.fn(),
  revokeAppleAuthorization: jest.fn(),
}));
jest.mock("@/lib/appleReauth", () => ({ appleAuthorizationCode: jest.fn() }));
jest.mock("@/lib/appleRevocation", () => ({
  ...jest.requireActual("@/lib/appleRevocation"),
  appleRetryWait: () => Promise.resolve(),
}));

const send = createPrivacyRequest as jest.Mock;
const file = fileAccountDeletionRequest as jest.Mock;
const revoke = revokeAppleAuthorization as jest.Mock;
const appleSheet = appleAuthorizationCode as jest.Mock;

const revoked = {
  ok: true,
  requestId: "req_1",
  appleRevocation: { clientId: "ph.gridgo.client", status: "revoked", attemptedAt: "x", revokedAt: "x", error: null },
};
const refusedWith = (status: number, error: string) => new ApiError(status, { error });

function session() {
  return {
    startVerification: jest.fn(async () => ({ status: "needs_first_factor" })),
    prepareFirstFactorVerification: jest.fn(),
    attemptFirstFactorVerification: jest.fn(async () => ({ status: "complete" })),
  };
}

async function submit(apple = true) {
  useAccountDeletion.getState().setSecret("secret-pass");
  await useAccountDeletion.getState().submit("password", session(), apple);
}

beforeEach(() => {
  useAccountDeletion.getState().reset();
  send.mockReset().mockResolvedValue({ id: "prq_1", kind: "deletion", status: "pending", requestedAt: "x", dueAt: "2026-11-20T02:00:00.000Z" });
  file.mockReset().mockResolvedValue(undefined);
  revoke.mockReset().mockResolvedValue(revoked);
  appleSheet.mockReset().mockResolvedValueOnce("code-1").mockResolvedValueOnce("code-2");
});

describe("an Apple-linked iPhone account", () => {
  it("files the request first, then sends a fresh Apple code with this app's bundle id", async () => {
    await submit();

    expect(useAccountDeletion.getState()).toMatchObject({ sent: true, apple: "revoked", appleError: null });
    expect(send).toHaveBeenCalledWith("deletion");
    expect(file).toHaveBeenCalledTimes(1);
    expect(revoke).toHaveBeenCalledWith("ph.gridgo.client", "code-1");
    expect(send.mock.invocationCallOrder[0]).toBeLessThan(file.mock.invocationCallOrder[0]);
    expect(file.mock.invocationCallOrder[0]).toBeLessThan(appleSheet.mock.invocationCallOrder[0]);
    // The code never reaches state, so nothing can render, log or persist it.
    expect(JSON.stringify(useAccountDeletion.getState())).not.toContain("code-1");
  });

  it("never asks Apple again after success", async () => {
    await submit();
    await useAccountDeletion.getState().revokeApple();
    expect(appleSheet).toHaveBeenCalledTimes(1);
    expect(revoke).toHaveBeenCalledTimes(1);
  });

  it("keeps the request when the person closes Apple's sheet, and offers Apple again", async () => {
    appleSheet.mockReset().mockRejectedValueOnce({ code: "ERR_REQUEST_CANCELED" }).mockResolvedValueOnce("code-2");
    await submit();

    expect(useAccountDeletion.getState()).toMatchObject({ sent: true, apple: "failed", appleError: APPLE_CANCELLED, appleNext: "sign_in" });
    expect(revoke).not.toHaveBeenCalled();

    await useAccountDeletion.getState().revokeApple();
    expect(revoke).toHaveBeenCalledWith("ph.gridgo.client", "code-2");
    expect(useAccountDeletion.getState().apple).toBe("revoked");
    // The request is filed once, not again for the second Apple sign-in.
    expect(file).toHaveBeenCalledTimes(1);
  });

  it("retries a lost answer with the same code before asking Apple again", async () => {
    revoke.mockReset().mockRejectedValueOnce(new TypeError("Network request failed")).mockResolvedValueOnce(revoked);
    await submit();

    expect(revoke).toHaveBeenCalledTimes(2);
    expect(revoke.mock.calls.map((call) => call[1])).toEqual(["code-1", "code-1"]);
    expect(appleSheet).toHaveBeenCalledTimes(1);
    expect(useAccountDeletion.getState().apple).toBe("revoked");
  });

  it("holds the code through a tapped retry when every answer was lost", async () => {
    revoke.mockReset().mockRejectedValue(new Error("The request timed out. Try again."));
    await submit();
    expect(useAccountDeletion.getState()).toMatchObject({ apple: "failed", appleError: APPLE_NO_ANSWER, appleNext: "retry" });
    expect(revoke).toHaveBeenCalledTimes(APPLE_REVOCATION_ATTEMPTS);

    revoke.mockReset().mockResolvedValue(revoked);
    await useAccountDeletion.getState().revokeApple();
    expect(revoke).toHaveBeenCalledWith("ph.gridgo.client", "code-1");
    expect(appleSheet).toHaveBeenCalledTimes(1);
    expect(useAccountDeletion.getState().apple).toBe("revoked");
  });

  it("keeps the privacy request and offers a retry when the deletion request cannot be filed", async () => {
    file.mockReset().mockRejectedValueOnce(new TypeError("Network request failed")).mockResolvedValueOnce(undefined);
    await submit();

    expect(useAccountDeletion.getState()).toMatchObject({ sent: true, apple: "failed", appleError: APPLE_PREPARE_FAILED, appleNext: "retry" });
    expect(appleSheet).not.toHaveBeenCalled();

    await useAccountDeletion.getState().revokeApple();
    expect(file).toHaveBeenCalledTimes(2);
    expect(useAccountDeletion.getState().apple).toBe("revoked");
  });

  it("files the request again when the API cannot find it, keeping the same code", async () => {
    revoke.mockReset().mockRejectedValueOnce(refusedWith(409, "account_deletion_request_required")).mockResolvedValueOnce(revoked);
    await submit();
    expect(useAccountDeletion.getState()).toMatchObject({ apple: "failed", appleNext: "retry" });

    await useAccountDeletion.getState().revokeApple();
    expect(file).toHaveBeenCalledTimes(2);
    expect(revoke.mock.calls.map((call) => call[1])).toEqual(["code-1", "code-1"]);
    expect(useAccountDeletion.getState().apple).toBe("revoked");
  });

  const documented: [number, string][] = [
    [400, "confirmation_required"],
    [400, "invalid_apple_client_id"],
    [400, "invalid_apple_authorization_code"],
    [401, "unauthorized"],
    [403, "apple_identity_mismatch"],
    [409, "account_deletion_request_required"],
    [409, "apple_account_not_linked"],
    [409, "apple_revocation_in_progress"],
    [502, "clerk_unavailable"],
    [502, "apple_unavailable"],
    [502, "apple_token_exchange_failed"],
    [502, "apple_identity_invalid"],
    [502, "apple_revocation_failed"],
    [503, "apple_revocation_not_configured"],
  ];

  it.each(documented)("%i %s is said plainly and never reads as disconnected", async (status, code) => {
    revoke.mockReset().mockRejectedValue(refusedWith(status, code));
    await submit();

    const expected = appleRevocationFailure(code);
    if (expected.status !== "failed") throw new Error("unreachable");
    expect(useAccountDeletion.getState()).toMatchObject({
      sent: true,
      apple: "failed",
      appleError: expected.message,
      appleNext: expected.next,
    });
    const sameCodeAgain = code === "apple_revocation_in_progress" || code === "clerk_unavailable";
    expect(revoke).toHaveBeenCalledTimes(sameCodeAgain ? APPLE_REVOCATION_ATTEMPTS : 1);
    expect(new Set(revoke.mock.calls.map((call) => call[1]))).toEqual(new Set(["code-1"]));

    // A spent code is dropped: the retry asks Apple for a new one.
    if (expected.next === "sign_in") {
      revoke.mockReset().mockResolvedValue(revoked);
      await useAccountDeletion.getState().revokeApple();
      expect(revoke).toHaveBeenCalledWith("ph.gridgo.client", "code-2");
    }
  });
});

describe("every other account", () => {
  it("sends the request exactly as before, with no Apple step", async () => {
    await submit(false);

    expect(useAccountDeletion.getState()).toMatchObject({ sent: true, apple: null });
    expect(send).toHaveBeenCalledTimes(1);
    expect(file).not.toHaveBeenCalled();
    expect(appleSheet).not.toHaveBeenCalled();
    expect(revoke).not.toHaveBeenCalled();
  });

  it("does not start Apple when the request itself failed", async () => {
    send.mockReset().mockRejectedValue(new Error("offline"));
    await submit(true);

    expect(useAccountDeletion.getState()).toMatchObject({ sent: false, apple: null });
    expect(appleSheet).not.toHaveBeenCalled();
  });
});

it("lets a step still running for a closed screen land nowhere", async () => {
  let finishApple!: (code: string) => void;
  appleSheet.mockReset().mockImplementationOnce(() => new Promise<string>((resolve) => (finishApple = resolve)));
  const running = submit();
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(useAccountDeletion.getState().apple).toBe("authorizing");

  useAccountDeletion.getState().reset();
  finishApple("late-code");
  await running;

  expect(revoke).not.toHaveBeenCalled();
  expect(useAccountDeletion.getState()).toMatchObject({ sent: false, apple: null });
});
