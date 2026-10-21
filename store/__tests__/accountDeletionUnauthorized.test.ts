import * as api from "@/lib/api";
import { appleAuthorizationCode } from "@/lib/appleReauth";
import { appleRevocationFailure } from "@/lib/appleRevocation";
import { forgetAppleRevocation, useAccountDeletion } from "@/store/accountDeletion";

// The real API wrapper, so the 401 path runs through `request()` and its
// unauthorized listeners exactly as on a phone. Only Apple's sheet is played.
jest.mock("@/lib/appleReauth", () => ({ appleAuthorizationCode: jest.fn(async () => "synthetic-code") }));

function reply(status: number, body: unknown) {
  return { ok: status < 400, status, text: async () => JSON.stringify(body) } as Response;
}

const session = {
  startVerification: jest.fn(async () => ({ status: "needs_first_factor" })),
  prepareFirstFactorVerification: jest.fn(),
  attemptFirstFactorVerification: jest.fn(async () => ({ status: "complete" })),
};

/**
 * A final 401 on the revocation must not clear the session underneath the
 * screen before it can say why: the explanation is shown with the request
 * kept, and "Sign in again" then runs the ordinary recovery.
 */
it("says why after GRIDGO refuses the sign-in, then recovers the session on request", async () => {
  api.setToken(null);
  api.setTokenProvider(async () => "synthetic-clerk-token");
  const unauthorized = jest.fn();
  const stop = api.onUnauthorized(unauthorized);
  const fetchMock = jest.spyOn(global, "fetch").mockImplementation(async (input, init) => {
    const path = new URL(String(input)).pathname;
    if (path === "/me/privacy-requests") {
      return reply(201, { request: { id: "prq_1", kind: "deletion", status: "pending", requestedAt: "x", dueAt: "2026-11-20T02:00:00.000Z" } });
    }
    if (path === "/me/account-deletion-request" && init?.method === "POST") return reply(202, { ok: true });
    if (path === "/me/account-deletion-request") return reply(200, { request: { id: "req_1", status: "pending", appleRevocations: [] } });
    if (path === "/me/account-deletion-request/apple-revocation") return reply(401, { error: "unauthorized" });
    return reply(404, { error: "not_found" });
  });
  try {
    forgetAppleRevocation();
    useAccountDeletion.getState().reset();
    useAccountDeletion.getState().setSecret("secret-pass");
    await useAccountDeletion.getState().submit("password", session, "user_clerk_apple");

    const expected = appleRevocationFailure("unauthorized");
    if (expected.status !== "failed") throw new Error("unreachable");
    expect(useAccountDeletion.getState()).toMatchObject({
      sent: true,
      apple: "failed",
      appleError: expected.message,
      appleNext: "restore_session",
    });
    // The forced-token retry still ran; the session was not cleared yet.
    const revocationCalls = fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/apple-revocation"));
    expect(revocationCalls).toHaveLength(2);
    expect(unauthorized).not.toHaveBeenCalled();
    expect(appleAuthorizationCode).toHaveBeenCalledTimes(1);

    useAccountDeletion.getState().restoreSession();
    expect(unauthorized).toHaveBeenCalledTimes(1);
  } finally {
    stop();
    fetchMock.mockRestore();
    api.setTokenProvider(null);
  }
});
