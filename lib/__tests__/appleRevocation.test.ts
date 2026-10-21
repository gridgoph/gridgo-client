import {
  APPLE_NO_ANSWER,
  APPLE_REVOCATION_ATTEMPTS,
  APPLE_UNKNOWN_FAILURE,
  appleRevocationApplies,
  appleRevocationFailure,
  hasAppleAccount,
  readAppleRevocationReply,
  revokeWithSameCode,
  type AppleRevocationReply,
} from "@/lib/appleRevocation";

const apple = { externalAccounts: [{ provider: "google" }, { provider: "apple" }] };
const google = { externalAccounts: [{ provider: "google" }] };

const revoked = {
  ok: true,
  requestId: "req_1",
  appleRevocation: {
    clientId: "ph.gridgo.client",
    status: "revoked",
    attemptedAt: "2026-10-21T02:00:00.000Z",
    revokedAt: "2026-10-21T02:00:01.000Z",
    error: null,
  },
};

const refused = (error: string): AppleRevocationReply => ({ kind: "refused", body: { error } });

describe("who disconnects Sign in with Apple", () => {
  it("is an iPhone account with an Apple link, and nobody else", () => {
    expect(hasAppleAccount(apple)).toBe(true);
    expect(hasAppleAccount(google)).toBe(false);
    expect(hasAppleAccount({ externalAccounts: [] })).toBe(false);
    expect(hasAppleAccount(null)).toBe(false);

    expect(appleRevocationApplies("ios", apple)).toBe(true);
    expect(appleRevocationApplies("android", apple)).toBe(false);
    expect(appleRevocationApplies("web", apple)).toBe(false);
    expect(appleRevocationApplies("ios", google)).toBe(false);
  });
});

describe("reading the revocation route", () => {
  it("is success only when the API says revoked", () => {
    expect(readAppleRevocationReply({ kind: "answered", body: revoked })).toEqual({ status: "revoked" });
    expect(
      readAppleRevocationReply({
        kind: "answered",
        body: { ...revoked, appleRevocation: { ...revoked.appleRevocation, status: "retry_required" } },
      }).status,
    ).toBe("failed");
    expect(readAppleRevocationReply({ kind: "answered", body: null }).status).toBe("failed");
  });

  it("never claims revocation for a recorded provider failure", () => {
    const result = readAppleRevocationReply({
      kind: "refused",
      body: {
        error: "apple_revocation_failed",
        requestId: "req_1",
        appleRevocation: { ...revoked.appleRevocation, status: "retry_required", revokedAt: null, error: "apple_revocation_failed" },
      },
    });
    expect(result).toMatchObject({ status: "failed", code: "apple_revocation_failed", next: "sign_in" });
  });

  it("says a lost answer was lost, and retries it with the same code", () => {
    expect(readAppleRevocationReply({ kind: "lost" })).toEqual({
      status: "failed",
      code: null,
      message: APPLE_NO_ANSWER,
      next: "retry",
    });
  });

  // The contract's table, row by row: what the person can do next.
  it.each([
    ["confirmation_required", "retry"],
    ["invalid_apple_client_id", null],
    ["invalid_apple_authorization_code", "sign_in"],
    ["unauthorized", null],
    ["apple_identity_mismatch", "sign_in"],
    ["account_deletion_request_required", "retry"],
    ["apple_account_not_linked", null],
    ["apple_revocation_in_progress", "retry"],
    ["clerk_unavailable", "retry"],
    ["apple_unavailable", "sign_in"],
    ["apple_token_exchange_failed", "sign_in"],
    ["apple_identity_invalid", "sign_in"],
    ["apple_revocation_failed", "sign_in"],
    ["apple_revocation_not_configured", null],
  ])("%s → %s, in words that keep the deletion request", (code, next) => {
    const result = appleRevocationFailure(code);
    expect(result).toMatchObject({ status: "failed", code, next });
    if (result.status !== "failed") throw new Error("unreachable");
    expect(result.message).not.toBe(APPLE_UNKNOWN_FAILURE);
    expect(result.message).not.toMatch(/disconnected from GRIDGO\./);
    expect(result.message).toContain("Your deletion request is still with Operations.");
    expect(result.message).not.toContain(code);
  });

  it("treats an unknown code as a retry with the same code", () => {
    expect(appleRevocationFailure("teapot")).toMatchObject({ message: APPLE_UNKNOWN_FAILURE, next: "retry" });
    expect(appleRevocationFailure(null)).toMatchObject({ message: APPLE_UNKNOWN_FAILURE, next: "retry" });
  });
});

describe("retrying one code", () => {
  const instant = () => Promise.resolve();

  it("resends the same code after a lost answer, and stops at success", async () => {
    const send = jest
      .fn<Promise<AppleRevocationReply>, []>()
      .mockResolvedValueOnce({ kind: "lost" })
      .mockResolvedValueOnce({ kind: "answered", body: revoked });
    await expect(revokeWithSameCode(send, instant)).resolves.toEqual({ status: "revoked" });
    expect(send).toHaveBeenCalledTimes(2);
  });

  it.each(["apple_revocation_in_progress", "clerk_unavailable"])(
    "waits and resends the same code on %s",
    async (code) => {
      const wait = jest.fn(instant);
      const send = jest
        .fn<Promise<AppleRevocationReply>, []>()
        .mockResolvedValueOnce(refused(code))
        .mockResolvedValueOnce({ kind: "answered", body: revoked });
      await expect(revokeWithSameCode(send, wait)).resolves.toEqual({ status: "revoked" });
      expect(wait).toHaveBeenCalledTimes(1);
    },
  );

  it("does not resend a code the API says is spent", async () => {
    const send = jest.fn<Promise<AppleRevocationReply>, []>().mockResolvedValue(refused("invalid_apple_authorization_code"));
    await expect(revokeWithSameCode(send, instant)).resolves.toMatchObject({ next: "sign_in" });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("gives up after a bounded number of tries, still holding the code for a retry", async () => {
    const send = jest.fn<Promise<AppleRevocationReply>, []>().mockResolvedValue({ kind: "lost" });
    await expect(revokeWithSameCode(send, instant)).resolves.toMatchObject({ message: APPLE_NO_ANSWER, next: "retry" });
    expect(send).toHaveBeenCalledTimes(APPLE_REVOCATION_ATTEMPTS);
  });
});
