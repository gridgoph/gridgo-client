import {
  adoptOrClearClerkSession,
  awaitClerkSessionToken,
  clearClerkSessionForNewAttempt,
  clerkNeedsNewPasswordMessage,
  clerkPasswordIncompleteMessage,
  clerkSessionToken,
  clerkSignOutRecoveryMessage,
  clerkTokenProvider,
  clerkSignOutRetryLabel,
  continuationAfterPassword,
  isClerkSignedOutError,
  pickSupportedSecondFactor,
  projectionForTypedEmail,
  releaseClerkSession,
  verificationCodeGate,
} from "@/lib/clerkSignIn";

describe("clerkSignOutRetryLabel", () => {
  it("does not ask a refused email to sign out", () => {
    expect(
      clerkSignOutRetryLabel("This email is not available. Try a different email."),
    ).toBeUndefined();
  });

  it("keeps the leftover-session recovery", () => {
    expect(clerkSignOutRetryLabel(clerkSignOutRecoveryMessage)).toBe("Sign out and try again");
  });
});

describe("clerkSessionToken", () => {
  it("reads Clerk's cache and never forces a mint when it answers", async () => {
    const getToken = jest.fn(async () => "clerk-jwt");
    await expect(clerkSessionToken(getToken)).resolves.toBe("clerk-jwt");
    expect(getToken).toHaveBeenCalledTimes(1);
    expect(getToken).toHaveBeenCalledWith(undefined);
    expect(getToken).not.toHaveBeenCalledWith({ skipCache: true });
  });

  it("forces exactly one mint when the cache is empty, and treats blanks as missing", async () => {
    const getToken = jest
      .fn<Promise<string | null>, [unknown?]>()
      .mockResolvedValueOnce("  ")
      .mockResolvedValue("clerk-jwt");
    await expect(clerkSessionToken(getToken)).resolves.toBe("clerk-jwt");
    expect(getToken).toHaveBeenCalledTimes(2);
    expect(getToken).toHaveBeenNthCalledWith(1, undefined);
    expect(getToken).toHaveBeenNthCalledWith(2, { skipCache: true });
  });

  it("answers null instead of throwing once Clerk is signed out", async () => {
    const getToken = jest.fn(async () => {
      throw new Error("Unable to authenticate this request, you are signed out.");
    });
    await expect(clerkSessionToken(getToken)).resolves.toBeNull();
  });
});

describe("clerkTokenProvider", () => {
  it("keeps the bearer path off the network until gridgo-api refuses a token", async () => {
    const getToken = jest.fn(async () => "clerk-jwt");
    const provider = clerkTokenProvider(getToken);

    await expect(provider()).resolves.toBe("clerk-jwt");
    expect(getToken).toHaveBeenCalledTimes(1);
    expect(getToken).toHaveBeenCalledWith(undefined);

    // Only the post-401 retry spends a Clerk FAPI round trip.
    await expect(provider({ force: true })).resolves.toBe("clerk-jwt");
    expect(getToken).toHaveBeenNthCalledWith(2, { skipCache: true });
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

  it("costs one cached probe — no network — when Clerk already has a token", async () => {
    const getToken = jest.fn(async () => "clerk-jwt");
    await expect(
      awaitClerkSessionToken(getToken, { sleep: noSleep }),
    ).resolves.toBe("clerk-jwt");
    expect(getToken).toHaveBeenCalledTimes(1);
    expect(getToken).toHaveBeenCalledWith(undefined);
  });

  it("reads the cache first and only then forces mints", async () => {
    const getToken = jest.fn<Promise<string | null>, [unknown?]>().mockResolvedValue(null);
    await expect(
      awaitClerkSessionToken(getToken, { attempts: 3, delayMs: 0, sleep: noSleep }),
    ).resolves.toBeNull();
    expect(getToken).toHaveBeenNthCalledWith(1, undefined);
    expect(getToken).toHaveBeenNthCalledWith(2, { skipCache: true });
    expect(getToken).toHaveBeenNthCalledWith(3, { skipCache: true });
  });

  it("defaults to a cached probe and a single mint, not a storm of them", async () => {
    const getToken = jest.fn<Promise<string | null>, [unknown?]>().mockResolvedValue(null);
    await expect(awaitClerkSessionToken(getToken, { sleep: noSleep })).resolves.toBeNull();
    expect(getToken).toHaveBeenCalledTimes(2);
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

  it("does not hang when Clerk never answers", async () => {
    const signOut = jest.fn(() => new Promise(() => {}));
    await expect(releaseClerkSession(signOut, 20)).resolves.toBe(false);
  });
});

describe("clearClerkSessionForNewAttempt", () => {
  it("leaves a signed-out attempt alone", async () => {
    const signOut = jest.fn(async () => undefined);
    await expect(
      clearClerkSessionForNewAttempt({ isSignedIn: false, signOut }),
    ).resolves.toEqual({ status: "fresh" });
    expect(signOut).not.toHaveBeenCalled();
  });

  it("signs out a live leftover so the typed credentials can run", async () => {
    const signOut = jest.fn(async () => undefined);
    await expect(
      clearClerkSessionForNewAttempt({ isSignedIn: true, signOut }),
    ).resolves.toEqual({ status: "cleared" });
    expect(signOut).toHaveBeenCalled();
  });

  it("reports when the leftover cannot be signed out", async () => {
    const signOut = jest.fn(async () => {
      throw new Error("Clerk is unavailable");
    });
    await expect(
      clearClerkSessionForNewAttempt({ isSignedIn: true, signOut }),
    ).resolves.toEqual({
      status: "cleanup_failed",
      message: "GRIDGO could not sign you out of Clerk. Check your connection and try again.",
    });
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
    // The cached read settles it; adopting a live leftover costs no round trip.
    expect(getToken).toHaveBeenCalledTimes(1);
    expect(getToken).toHaveBeenCalledWith(undefined);
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

describe("projectionForTypedEmail", () => {
  it("refuses a leftover rider for the typed email", async () => {
    await expect(
      projectionForTypedEmail({
        typedEmail: "mddprado00290@usep.edu.ph",
        getToken: async () => "clerk-jwt",
        me: async () => ({ email: "mddprado00290@usep.edu.ph", role: "rider" }),
      }),
    ).resolves.toBe("wrong_role");
  });

  it("does not treat a leftover client as the typed rider email", async () => {
    await expect(
      projectionForTypedEmail({
        typedEmail: "mddprado00290@usep.edu.ph",
        getToken: async () => "clerk-jwt",
        me: async () => ({ email: "markdavidprado@gmail.com", role: "client" }),
      }),
    ).resolves.toBe("other_account");
  });

  it("is unknown when Clerk has no JWT yet", async () => {
    await expect(
      projectionForTypedEmail({
        typedEmail: "client@gridgo.ph",
        getToken: async () => null,
        me: async () => {
          throw new Error("must not call me without a token");
        },
      }),
    ).resolves.toBe("unknown");
  });
});

describe("verificationCodeGate", () => {
  it("blocks a rider before any code is sent, even without a leftover JWT", async () => {
    await expect(
      verificationCodeGate({
        typedEmail: "mddprado00290@usep.edu.ph",
        getToken: async () => null,
        me: async () => {
          throw new Error("must not call me without a token");
        },
        emailAvailable: async () => false,
      }),
    ).resolves.toBe("wrong_role");
  });

  it("still collects a code for a client on a new device", async () => {
    await expect(
      verificationCodeGate({
        typedEmail: "client@gridgo.ph",
        getToken: async () => null,
        me: async () => {
          throw new Error("must not call me without a token");
        },
        emailAvailable: async () => true,
      }),
    ).resolves.toBe("collect");
  });
});
