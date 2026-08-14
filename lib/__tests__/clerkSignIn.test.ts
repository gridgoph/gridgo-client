import { adoptOrClearClerkSession, clerkSessionToken } from "@/lib/clerkSignIn";

describe("clerkSessionToken", () => {
  it("asks Clerk for a fresh JWT and treats blanks as missing", async () => {
    const getToken = jest.fn(async () => "  ");
    await expect(clerkSessionToken(getToken)).resolves.toBeNull();
    expect(getToken).toHaveBeenCalledWith({ skipCache: true });
  });
});

describe("adoptOrClearClerkSession", () => {
  const setActive = jest.fn(async () => undefined);
  const signOut = jest.fn(async () => undefined);

  beforeEach(() => {
    setActive.mockClear();
    signOut.mockClear();
  });

  it("leaves a signed-out attempt alone", async () => {
    const getToken = jest.fn();
    await expect(
      adoptOrClearClerkSession({
        isSignedIn: false,
        sessionId: "sess_1",
        getToken,
        setActive,
        signOut,
      }),
    ).resolves.toEqual({ status: "fresh" });
    expect(getToken).not.toHaveBeenCalled();
    expect(setActive).not.toHaveBeenCalled();
    expect(signOut).not.toHaveBeenCalled();
  });

  it("adopts a leftover session that can still mint a JWT", async () => {
    const getToken = jest.fn(async () => "clerk-jwt");
    await expect(
      adoptOrClearClerkSession({
        isSignedIn: true,
        sessionId: "sess_leftover",
        getToken,
        setActive,
        signOut,
      }),
    ).resolves.toEqual({ status: "adopt" });
    expect(setActive).toHaveBeenCalledWith({ session: "sess_leftover" });
    expect(getToken).toHaveBeenCalledWith({ skipCache: true });
    expect(signOut).not.toHaveBeenCalled();
  });

  it("signs out an expired leftover that cannot produce a token", async () => {
    const getToken = jest.fn(async () => null);
    await expect(
      adoptOrClearClerkSession({
        isSignedIn: true,
        sessionId: "sess_dead",
        getToken,
        setActive,
        signOut,
      }),
    ).resolves.toEqual({ status: "cleared" });
    expect(signOut).toHaveBeenCalled();
  });

  it("still clears when setActive rejects a dead leftover id", async () => {
    setActive.mockRejectedValueOnce(new Error("session not found"));
    const getToken = jest.fn(async () => null);
    await expect(
      adoptOrClearClerkSession({
        isSignedIn: true,
        sessionId: "sess_dead",
        getToken,
        setActive,
        signOut,
      }),
    ).resolves.toEqual({ status: "cleared" });
    expect(signOut).toHaveBeenCalled();
  });
});
