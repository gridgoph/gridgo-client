import { ApiError, type User } from "@/lib/api";
import { bridgeClerkToGridgo } from "@/lib/clerkSessionBridge";

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
