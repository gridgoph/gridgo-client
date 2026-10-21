import {
  ApiError,
  createPrivacyRequest,
  fileAccountDeletionRequest,
  getAccountDeletionRequest,
  recoverUnauthorizedSession,
  revokeAppleAuthorization,
} from "@/lib/api";
import { appleAuthorizationCode } from "@/lib/appleReauth";
import {
  APPLE_CANCELLED,
  APPLE_CHECK_FAILED,
  APPLE_NO_ANSWER,
  APPLE_PREPARE_FAILED,
  APPLE_REVOCATION_ATTEMPTS,
  appleRevocationFailure,
} from "@/lib/appleRevocation";
import { claimAppleRevocation, forgetAppleRevocation, useAccountDeletion } from "@/store/accountDeletion";

jest.mock("@/lib/api", () => ({
  ApiError: jest.requireActual("@/lib/api").ApiError,
  createPrivacyRequest: jest.fn(),
  fileAccountDeletionRequest: jest.fn(),
  getAccountDeletionRequest: jest.fn(),
  recoverUnauthorizedSession: jest.fn(),
  revokeAppleAuthorization: jest.fn(),
}));
jest.mock("@/lib/appleReauth", () => ({ appleAuthorizationCode: jest.fn() }));
jest.mock("@/lib/appleRevocation", () => ({
  ...jest.requireActual("@/lib/appleRevocation"),
  appleRetryWait: () => mockWait(),
}));

let mockWait: () => Promise<void> = () => Promise.resolve();

const send = createPrivacyRequest as jest.Mock;
const file = fileAccountDeletionRequest as jest.Mock;
const revoke = revokeAppleAuthorization as jest.Mock;
const pendingRequest = getAccountDeletionRequest as jest.Mock;
const OWNER = "user_clerk_apple";
const nothingRecorded = { id: "req_1", status: "pending", appleRevocations: [] };
const recordedRevoked = {
  id: "req_1",
  status: "pending",
  appleRevocations: [{ clientId: "ph.gridgo.client", status: "revoked", attemptedAt: "x", revokedAt: "x", error: null }],
};
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

async function submit(owner: string | null = OWNER) {
  useAccountDeletion.getState().setSecret("secret-pass");
  await useAccountDeletion.getState().submit("password", session(), owner);
}

/** Leaving the screen and opening it again. */
function reopen() {
  useAccountDeletion.getState().reset();
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  useAccountDeletion.getState().reset();
  forgetAppleRevocation();
  mockWait = () => Promise.resolve();
  pendingRequest.mockReset().mockResolvedValue(nothingRecorded);
  (recoverUnauthorizedSession as jest.Mock).mockReset();
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
    await submit(null);

    expect(useAccountDeletion.getState()).toMatchObject({ sent: true, apple: null });
    expect(send).toHaveBeenCalledTimes(1);
    expect(file).not.toHaveBeenCalled();
    expect(appleSheet).not.toHaveBeenCalled();
    expect(revoke).not.toHaveBeenCalled();
    expect(pendingRequest).not.toHaveBeenCalled();
  });

  it("does not start Apple when the request itself failed", async () => {
    send.mockReset().mockRejectedValue(new Error("offline"));
    await submit();

    expect(useAccountDeletion.getState()).toMatchObject({ sent: false, apple: null });
    expect(appleSheet).not.toHaveBeenCalled();
  });
});

describe("the Apple step outlives the screen", () => {
  it("never asks Apple again after a success, when Delete account is opened again", async () => {
    await submit();
    pendingRequest.mockResolvedValue(recordedRevoked);
    reopen();
    await submit();

    expect(appleSheet).toHaveBeenCalledTimes(1);
    expect(revoke).toHaveBeenCalledTimes(1);
    expect(useAccountDeletion.getState()).toMatchObject({ sent: true, apple: "revoked" });
  });

  it("remembers its own success even when GRIDGO's record cannot be read", async () => {
    await submit();
    pendingRequest.mockRejectedValue(new TypeError("Network request failed"));
    reopen();
    await submit();

    expect(appleSheet).toHaveBeenCalledTimes(1);
    expect(useAccountDeletion.getState().apple).toBe("revoked");
  });

  it("honours a success GRIDGO recorded before the app restarted", async () => {
    pendingRequest.mockResolvedValue(recordedRevoked);
    await submit();

    expect(appleSheet).not.toHaveBeenCalled();
    expect(revoke).not.toHaveBeenCalled();
    expect(useAccountDeletion.getState()).toMatchObject({ sent: true, apple: "revoked" });
  });

  it("replays the held code after the screen was left with every answer lost", async () => {
    revoke.mockReset().mockRejectedValue(new TypeError("Network request failed"));
    await submit();
    reopen();
    revoke.mockReset().mockResolvedValue(revoked);
    await submit();

    expect(revoke).toHaveBeenCalledWith("ph.gridgo.client", "code-1");
    expect(revoke).toHaveBeenCalledTimes(1);
    expect(appleSheet).toHaveBeenCalledTimes(1);
    expect(useAccountDeletion.getState().apple).toBe("revoked");
  });

  it("never asks Apple for a fresh code before GRIDGO's record has been read", async () => {
    pendingRequest.mockRejectedValue(new TypeError("Network request failed"));
    await submit();

    expect(appleSheet).not.toHaveBeenCalled();
    expect(useAccountDeletion.getState()).toMatchObject({ sent: true, apple: "failed", appleError: APPLE_CHECK_FAILED, appleNext: "retry" });
  });

  it("drops a held code that belonged to an earlier deletion request", async () => {
    revoke.mockReset().mockRejectedValue(new TypeError("Network request failed"));
    await submit();
    pendingRequest.mockResolvedValue({ ...nothingRecorded, id: "req_2" });
    reopen();
    revoke.mockReset().mockResolvedValue(revoked);
    await submit();

    expect(revoke).toHaveBeenLastCalledWith("ph.gridgo.client", "code-2");
  });

  it("drops a held code when another account deletes", async () => {
    revoke.mockReset().mockRejectedValue(new TypeError("Network request failed"));
    await submit();
    reopen();
    revoke.mockReset().mockResolvedValue(revoked);
    await submit("user_someone_else");

    expect(revoke).toHaveBeenLastCalledWith("ph.gridgo.client", "code-2");
  });

  it("believes GRIDGO's newer failure over a success this phone heard earlier", async () => {
    await submit();
    reopen();
    pendingRequest.mockResolvedValue({
      ...nothingRecorded,
      appleRevocations: [{ clientId: "ph.gridgo.client", status: "retry_required", error: "apple_revocation_failed" }],
    });
    revoke.mockReset().mockRejectedValue(refusedWith(502, "apple_revocation_failed"));
    await submit();

    expect(appleSheet).toHaveBeenCalledTimes(2);
    expect(useAccountDeletion.getState()).toMatchObject({ apple: "failed", appleNext: "sign_in" });
  });

  it("lets a late success for an earlier request mark only that request", async () => {
    let finishFirst!: (body: unknown) => void;
    revoke.mockReset().mockImplementationOnce(() => new Promise((resolve) => (finishFirst = resolve)));
    const first = submit();
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(revoke).toHaveBeenCalledTimes(1);

    reopen();
    pendingRequest.mockResolvedValue({ ...nothingRecorded, id: "req_2" });
    revoke.mockRejectedValueOnce(refusedWith(502, "apple_revocation_failed"));
    await submit();
    expect(useAccountDeletion.getState().apple).toBe("failed");

    finishFirst(revoked);
    await first;
    pendingRequest.mockRejectedValue(new TypeError("Network request failed"));
    await useAccountDeletion.getState().revokeApple();

    expect(useAccountDeletion.getState()).toMatchObject({ apple: "failed", appleError: APPLE_CHECK_FAILED });
  });

  it("keeps a held code for the request it was asked for, when another request's work ends", async () => {
    let finishFirst!: (body: unknown) => void;
    revoke.mockReset().mockImplementationOnce(() => new Promise((resolve) => (finishFirst = resolve)));
    const first = submit();
    await new Promise((resolve) => setTimeout(resolve, 5));

    reopen();
    pendingRequest.mockResolvedValue({ ...nothingRecorded, id: "req_2" });
    revoke.mockRejectedValueOnce(new TypeError("Network request failed")).mockRejectedValue(new TypeError("Network request failed"));
    await submit();
    expect(revoke).toHaveBeenLastCalledWith("ph.gridgo.client", "code-2");

    finishFirst({ ...revoked, requestId: "req_1" });
    await first;
    revoke.mockReset().mockResolvedValue({ ...revoked, requestId: "req_2" });
    await useAccountDeletion.getState().revokeApple();

    expect(revoke).toHaveBeenCalledWith("ph.gridgo.client", "code-2");
    expect(appleSheet).toHaveBeenCalledTimes(2);
    expect(useAccountDeletion.getState().apple).toBe("revoked");
  });

  it("drops a held code on sign-out", async () => {
    revoke.mockReset().mockRejectedValue(new TypeError("Network request failed"));
    await submit();
    forgetAppleRevocation();
    reopen();
    revoke.mockReset().mockResolvedValue(revoked);
    await submit();

    expect(revoke).toHaveBeenLastCalledWith("ph.gridgo.client", "code-2");
  });

  it("keeps an unused code after GRIDGO refused the sign-in, and offers to sign in again", async () => {
    revoke.mockReset().mockRejectedValueOnce(refusedWith(401, "unauthorized")).mockResolvedValueOnce(revoked);
    await submit();
    expect(useAccountDeletion.getState()).toMatchObject({ sent: true, apple: "failed", appleNext: "restore_session" });

    useAccountDeletion.getState().restoreSession();
    expect(recoverUnauthorizedSession).toHaveBeenCalledTimes(1);

    reopen();
    await submit();
    expect(revoke.mock.calls.map((call) => call[1])).toEqual(["code-1", "code-1"]);
    expect(appleSheet).toHaveBeenCalledTimes(1);
  });
});

describe("a screen closed while work is in flight", () => {
  it("starts no Apple work when the privacy request answers late", async () => {
    let finishPrivacy!: (request: unknown) => void;
    send.mockReset().mockImplementationOnce(() => new Promise((resolve) => (finishPrivacy = resolve)));
    const running = submit();
    await tick();
    expect(useAccountDeletion.getState().busy).toBe("sending");

    reopen();
    finishPrivacy({ id: "prq_1", kind: "deletion", status: "pending", requestedAt: "x", dueAt: "x" });
    await running;

    expect(file).not.toHaveBeenCalled();
    expect(appleSheet).not.toHaveBeenCalled();
    expect(useAccountDeletion.getState()).toMatchObject({ sent: false, busy: null, apple: null });
  });

  it("sends nothing when the password check answers late", async () => {
    let finishCheck!: (step: { status: string }) => void;
    const s = session();
    s.attemptFirstFactorVerification.mockImplementationOnce(() => new Promise((resolve) => (finishCheck = resolve)));
    useAccountDeletion.getState().setSecret("secret-pass");
    const running = useAccountDeletion.getState().submit("password", s, OWNER);
    await tick();
    expect(useAccountDeletion.getState().busy).toBe("checking");

    reopen();
    finishCheck({ status: "complete" });
    await running;

    expect(send).not.toHaveBeenCalled();
    expect(useAccountDeletion.getState()).toMatchObject({ busy: null, confirmedAt: null });
  });

  it("does not open Apple's sheet when the account-deletion filing answers late", async () => {
    let finishFiling!: () => void;
    file.mockReset().mockImplementationOnce(() => new Promise<void>((resolve) => (finishFiling = resolve)));
    const running = submit();
    await tick();
    expect(useAccountDeletion.getState().apple).toBe("revoking");

    reopen();
    finishFiling();
    await running;

    expect(appleSheet).not.toHaveBeenCalled();
    expect(useAccountDeletion.getState()).toMatchObject({ sent: false, apple: null });
  });

  it("stops retrying when the screen closes between tries, and keeps the code", async () => {
    let finishWait!: () => void;
    mockWait = () => new Promise<void>((resolve) => (finishWait = resolve));
    revoke.mockReset().mockRejectedValueOnce(new TypeError("Network request failed"));
    const running = submit();
    // The first send is lost; close while waiting to retry.
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(revoke).toHaveBeenCalledTimes(1);
    reopen();
    finishWait();
    await running;
    mockWait = () => Promise.resolve();
    expect(revoke).toHaveBeenCalledTimes(1);

    revoke.mockReset().mockResolvedValue(revoked);
    await submit();
    expect(revoke).toHaveBeenCalledWith("ph.gridgo.client", "code-1");
    expect(appleSheet).toHaveBeenCalledTimes(1);
  });

  it("keeps a code Apple gave after the screen closed, for the next visit", async () => {
    let finishApple!: (code: string) => void;
    appleSheet.mockReset().mockImplementationOnce(() => new Promise<string>((resolve) => (finishApple = resolve)));
    const running = submit();
    await tick();
    expect(useAccountDeletion.getState().apple).toBe("authorizing");

    reopen();
    finishApple("late-code");
    await running;
    expect(revoke).not.toHaveBeenCalled();
    expect(useAccountDeletion.getState()).toMatchObject({ sent: false, apple: null });

    await submit();
    expect(revoke).toHaveBeenCalledWith("ph.gridgo.client", "late-code");
  });

  it("records an answer that lands after the screen closed", async () => {
    let finishRevoke!: (body: unknown) => void;
    revoke.mockReset().mockImplementationOnce(() => new Promise((resolve) => (finishRevoke = resolve)));
    const running = submit();
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(revoke).toHaveBeenCalledTimes(1);

    reopen();
    finishRevoke(revoked);
    await running;
    expect(useAccountDeletion.getState().apple).toBeNull();

    // GRIDGO's read is lost on the next visit; what this phone heard still counts.
    pendingRequest.mockRejectedValue(new TypeError("Network request failed"));
    await submit();
    expect(appleSheet).toHaveBeenCalledTimes(1);
    expect(useAccountDeletion.getState().apple).toBe("revoked");
  });
});

describe("another account signing in", () => {
  it("drops the held code, and the same account signing in again keeps it", async () => {
    revoke.mockReset().mockRejectedValue(new TypeError("Network request failed"));
    claimAppleRevocation("usr_1");
    await submit();
    claimAppleRevocation("usr_1");
    reopen();
    revoke.mockReset().mockRejectedValue(new TypeError("Network request failed"));
    await submit();
    expect(revoke).toHaveBeenLastCalledWith("ph.gridgo.client", "code-1");

    claimAppleRevocation("usr_2");
    reopen();
    revoke.mockReset().mockResolvedValue(revoked);
    await submit();
    expect(revoke).toHaveBeenLastCalledWith("ph.gridgo.client", "code-2");
  });
});
