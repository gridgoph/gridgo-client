import { ApiError, type User } from "@/lib/api";
import {
  bridgeClerkToGridgo,
  clerkTokenUnavailableMessage,
  wrongRoleMessage,
} from "@/lib/clerkSessionBridge";
import { userFacingError } from "@/lib/copy";

/** The copy this whole fix exists to keep off a live Clerk session. */
const sessionExpired = userFacingError(
  new ApiError(401, { error: "unauthorized" }),
  "fallback",
);

const client: User = {
  id: "u1",
  email: "ana@company.com",
  name: "Ana Santos",
  role: "client",
  accountType: "individual",
};

describe("bridgeClerkToGridgo", () => {
  it("activates then reloads /auth/me when the identity is unmapped", async () => {
    const me = jest
      .fn()
      .mockRejectedValueOnce(new ApiError(401, { error: "unauthorized" }))
      .mockResolvedValueOnce(client);
    const activate = jest.fn().mockResolvedValue(client);

    await expect(bridgeClerkToGridgo({ me, activate })).resolves.toEqual({
      kind: "adopt",
      user: client,
      provisioned: true,
    });

    expect(activate).toHaveBeenCalledWith({});
    expect(me).toHaveBeenCalledTimes(2);
  });

  it("refreshes the Clerk JWT after activate so /auth/me can carry gridgo_role", async () => {
    const me = jest
      .fn()
      .mockRejectedValueOnce(new ApiError(401, { error: "unauthorized" }))
      .mockResolvedValueOnce(client);
    const activate = jest.fn().mockResolvedValue(client);
    const refreshToken = jest.fn().mockResolvedValue("fresh-clerk-jwt");

    await expect(bridgeClerkToGridgo({ me, activate, refreshToken })).resolves.toEqual({
      kind: "adopt",
      user: client,
      provisioned: true,
    });
    expect(refreshToken).toHaveBeenCalledTimes(1);
    expect(me.mock.invocationCallOrder[1]).toBeGreaterThan(refreshToken.mock.invocationCallOrder[0]);
  });

  it("adopts an already-mapped client without activating", async () => {
    const me = jest.fn().mockResolvedValue(client);
    const activate = jest.fn();

    await expect(bridgeClerkToGridgo({ me, activate })).resolves.toEqual({
      kind: "adopt",
      user: client,
      provisioned: false,
    });
    expect(activate).not.toHaveBeenCalled();
  });

  it("asks for account type when activate cannot create the lockup", async () => {
    const me = jest.fn().mockRejectedValue(new ApiError(401, { error: "unauthorized" }));
    const activate = jest.fn().mockRejectedValue(
      new ApiError(400, { error: "invalid_account_type" }),
    );

    await expect(bridgeClerkToGridgo({ me, activate })).resolves.toEqual({
      kind: "needs_profile",
    });
  });

  it("treats a mapped supplier as the wrong app", async () => {
    const me = jest.fn().mockResolvedValue({ ...client, role: "supplier" as const });
    const activate = jest.fn();

    await expect(bridgeClerkToGridgo({ me, activate })).resolves.toEqual({
      kind: "wrong_role",
      role: "supplier",
    });
    expect(activate).not.toHaveBeenCalled();
  });

  it("maps a role-mismatch response from /auth/me to a signed-out message", async () => {
    const me = jest.fn().mockRejectedValue(
      new ApiError(403, { error: "forbidden", role: "rider" }),
    );

    const result = await bridgeClerkToGridgo({ me, activate: jest.fn() });

    expect(result).toEqual({ kind: "wrong_role", role: "rider" });
    expect(wrongRoleMessage("rider")).toBe(
      "This email is not available. Try a different email.",
    );
  });

  it("maps invitation_required to an obvious missing-client message", async () => {
    const me = jest.fn().mockRejectedValue(new ApiError(401, { error: "unauthorized" }));
    const activate = jest.fn().mockRejectedValue(
      new ApiError(403, { error: "invitation_required" }),
    );

    const result = await bridgeClerkToGridgo({ me, activate });

    expect(result).toEqual({ kind: "wrong_role", role: "" });
    expect(wrongRoleMessage("")).toBe(
      "This email is not available. Try a different email.",
    );
  });

  it("sends nothing until Clerk has minted a JWT", async () => {
    const me = jest.fn();
    const activate = jest.fn();
    const awaitToken = jest.fn(async () => "clerk-jwt");

    await expect(
      bridgeClerkToGridgo({ me: me.mockResolvedValue(client), activate, awaitToken }),
    ).resolves.toEqual({ kind: "adopt", user: client, provisioned: false });

    expect(awaitToken).toHaveBeenCalledTimes(1);
    expect(me.mock.invocationCallOrder[0]).toBeGreaterThan(
      awaitToken.mock.invocationCallOrder[0],
    );
  });

  it("never calls it a session expiry when Clerk hands over no token", async () => {
    const me = jest.fn();
    const activate = jest.fn();

    const result = await bridgeClerkToGridgo({
      me,
      activate,
      awaitToken: async () => null,
    });

    expect(result).toEqual({
      kind: "error",
      message: clerkTokenUnavailableMessage,
      signOut: false,
    });
    // The whole bug: an unauthenticated probe reads as a dead session.
    expect(result.kind === "error" && result.message).not.toBe(sessionExpired);
    expect(me).not.toHaveBeenCalled();
    expect(activate).not.toHaveBeenCalled();
  });

  it("reports a rejected token as unverified, not expired, when activate 401s", async () => {
    const unauthorized = new ApiError(401, { error: "unauthorized" });
    const me = jest.fn().mockRejectedValue(unauthorized);
    const activate = jest.fn().mockRejectedValue(unauthorized);

    const result = await bridgeClerkToGridgo({
      me,
      activate,
      awaitToken: async () => "clerk-jwt",
    });

    expect(result.kind).toBe("error");
    if (result.kind !== "error") return;
    expect(result.message).not.toBe(sessionExpired);
    expect(result.message).not.toMatch(/expired/i);
    expect(result.message).toMatch(/could not verify/i);
    // Clerk is signed in, so the recovery has to be a sign-out the person
    // presses — never an automatic one that hides why it happened.
    expect(result.signOut).toBe(false);
  });

  it("does not invent a client when the API has no activate route", async () => {
    const me = jest.fn().mockRejectedValue(new ApiError(401, { error: "unauthorized" }));
    const activate = jest.fn().mockRejectedValue(new ApiError(404, { error: "not_found" }));

    const result = await bridgeClerkToGridgo({ me, activate });
    expect(result.kind).toBe("error");
    if (result.kind !== "error") return;
    expect(result.signOut).toBe(false);
    expect(result.message).toMatch(/cannot create a client profile/i);
  });
});
