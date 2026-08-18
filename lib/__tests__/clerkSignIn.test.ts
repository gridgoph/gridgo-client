import {
  adoptOrClearClerkSession,
  awaitClerkSessionToken,
  clerkNeedsNewPasswordMessage,
  clerkPasswordIncompleteMessage,
  clerkSessionToken,
  continuationAfterPassword,
  isClerkSignedOutError,
  pickSupportedSecondFactor,
  releaseClerkSession,
} from "@/lib/clerkSignIn";

describe("clerkSessionToken", () => {
  it("asks Clerk for a fresh JWT and treats blanks as missing", async () => {
    const getToken = jest.fn(async () => "  ");
    await expect(clerkSessionToken(getToken)).resolves.toBeNull();
    expect(getToken).toHaveBeenCalledWith({ skipCache: true });
  });

  it("answers null instead of throwing once Clerk is signed out", async () => {
    const getToken = jest.fn(async () => {
      throw new Error("Unable to authenticate this request, you are signed out.");
    });
    await expect(clerkSessionToken(getToken)).resolves.toBeNull();
  });
});

describe("awaitClerkSessionToken", () => {
  const noSleep = async () => undefined;

  it("waits out the gap where a just-completed Clerk step has no JWT yet", async () => {
    const getToken = jest
      .fn<Promise<string | null>, [unknown?]>()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce("")
      .mockResolvedValue("clerk-jwt");

    await expect(
      awaitClerkSessionToken(getToken, { attempts: 5, delayMs: 0, sleep: noSleep }),
    ).resolves.toBe("clerk-jwt");
    expect(getToken).toHaveBeenCalledTimes(3);
  });

  it("costs one probe when Clerk already has a token", async () => {
    const getToken = jest.fn(async () => "clerk-jwt");
    await expect(
      awaitClerkSessionToken(getToken, { sleep: noSleep }),
    ).resolves.toBe("clerk-jwt");
    expect(getToken).toHaveBeenCalledTimes(1);
  });

  it("gives up rather than hanging when no token ever arrives", async () => {
    const getToken = jest.fn(async () => null);
    await expect(
      awaitClerkSessionToken(getToken, { attempts: 3, delayMs: 0, sleep: noSleep }),
    ).resolves.toBeNull();
    expect(getToken).toHaveBeenCalledTimes(3);
  });
});

describe("isClerkSignedOutError", () => {
  it("recognises the signed-out complaints Clerk throws from effects", () => {
    expect(isClerkSignedOutError(new Error("You are signed out"))).toBe(true);
    expect(
      isClerkSignedOutError(new Error("Unable to authenticate this request")),
    ).toBe(true);
    expect(isClerkSignedOutError(new Error("Wrong email or password"))).toBe(false);
    expect(isClerkSignedOutError(null)).toBe(false);
  });
});

describe("releaseClerkSession", () => {
  it("counts an already signed-out Clerk as released", async () => {
    const signOut = jest.fn(async () => {
      throw new Error("You are signed out");
    });
    await expect(releaseClerkSession(signOut)).resolves.toBe(true);
  });

  it("reports a sign-out that really failed", async () => {
    const signOut = jest.fn(async () => {
      throw new Error("Clerk is unavailable");
    });
    await expect(releaseClerkSession(signOut)).resolves.toBe(false);
  });
});

describe("adoptOrClearClerkSession", () => {
  const setActive = jest.fn(async () => undefined);
  const signOut = jest.fn(async () => undefined);
  const tokenWait = { attempts: 2, delayMs: 0, sleep: async () => undefined };

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

  it("keeps a leftover whose first JWT arrives a tick late", async () => {
    const getToken = jest
      .fn<Promise<string | null>, [unknown?]>()
      .mockResolvedValueOnce(null)
      .mockResolvedValue("clerk-jwt");

    await expect(
      adoptOrClearClerkSession({
        isSignedIn: true,
        sessionId: "sess_leftover",
        getToken,
        setActive,
        signOut,
        tokenWait,
      }),
    ).resolves.toEqual({ status: "adopt" });
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
        tokenWait,
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
        tokenWait,
      }),
    ).resolves.toEqual({ status: "cleared" });
    expect(signOut).toHaveBeenCalled();
  });

  it("reports when an expired leftover cannot be signed out", async () => {
    const getToken = jest.fn(async () => null);
    signOut.mockRejectedValueOnce(new Error("Clerk is unavailable"));

    await expect(
      adoptOrClearClerkSession({
        isSignedIn: true,
        sessionId: "sess_dead",
        getToken,
        setActive,
        signOut,
        tokenWait,
      }),
    ).resolves.toEqual({
      status: "cleanup_failed",
      message: "GRIDGO could not sign you out of Clerk. Check your connection and try again.",
    });
  });
});

describe("continuationAfterPassword", () => {
  it("finalizes a completed password attempt", () => {
    expect(continuationAfterPassword("complete")).toEqual({ kind: "complete" });
  });

  it("collects a code for second factor and new-device trust", () => {
    expect(continuationAfterPassword("needs_second_factor", [{ strategy: "email_code" }])).toEqual({
      kind: "verification",
      factor: "email_code",
    });
    expect(continuationAfterPassword("needs_client_trust", [{ strategy: "phone_code" }])).toEqual({
      kind: "verification",
      factor: "phone_code",
    });
  });

  it("never uses the generic incomplete copy for those statuses", () => {
    for (const status of ["needs_second_factor", "needs_client_trust"] as const) {
      const next = continuationAfterPassword(status, []);
      expect(next.kind).toBe("verification");
      expect(next).not.toEqual(
        expect.objectContaining({ message: clerkPasswordIncompleteMessage }),
      );
    }
  });

  it("keeps the generic copy for other incomplete statuses", () => {
    expect(continuationAfterPassword("needs_first_factor")).toEqual({
      kind: "blocked",
      message: clerkPasswordIncompleteMessage,
    });
  });

  it("sends a forced password change to recovery instead of a dead end", () => {
    expect(continuationAfterPassword("needs_new_password")).toEqual({
      kind: "blocked",
      message: clerkNeedsNewPasswordMessage,
    });
  });

  it("adopts the session Clerk kept rather than failing the sign-in", () => {
    expect(
      continuationAfterPassword("complete", [], { sessionId: "sess_leftover" }),
    ).toEqual({ kind: "existing_session", sessionId: "sess_leftover" });
  });
});

describe("pickSupportedSecondFactor", () => {
  it("prefers email, then the factor Clerk listed", () => {
    expect(pickSupportedSecondFactor(null)).toBe("email_code");
    expect(pickSupportedSecondFactor([{ strategy: "totp" }, { strategy: "email_code" }])).toBe(
      "email_code",
    );
    expect(pickSupportedSecondFactor([{ strategy: "backup_code" }, { strategy: "totp" }])).toBe(
      "totp",
    );
  });
});
