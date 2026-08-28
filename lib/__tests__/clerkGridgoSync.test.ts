import { ApiError, type User } from "@/lib/api";
import { invalidateClerkGridgoSync, syncClerkToGridgo } from "@/lib/clerkGridgoSync";
import { useSession } from "@/store/session";

const mockMe = jest.fn();
const mockActivate = jest.fn();
const mockSetTokenProvider = jest.fn();

jest.mock("@/lib/api", () => {
  const actual = jest.requireActual("@/lib/api");
  return {
    ...actual,
    me: (...args: unknown[]) => mockMe(...args),
    activateClerkClient: (...args: unknown[]) => mockActivate(...args),
    setTokenProvider: (...args: unknown[]) => mockSetTokenProvider(...args),
  };
});

const client: User = {
  id: "u1",
  email: "ana@company.com",
  name: "Ana",
  role: "client",
  accountType: "individual",
};

describe("clerkGridgoSync", () => {
  const getToken = jest.fn(async () => "clerk-jwt");
  const signOut = jest.fn(async () => undefined);

  beforeEach(() => {
    getToken.mockReset().mockResolvedValue("clerk-jwt");
    signOut.mockReset().mockResolvedValue(undefined);
    mockMe.mockReset();
    mockActivate.mockReset();
    mockSetTokenProvider.mockReset();
    useSession.setState({
      user: null,
      source: null,
      loading: false,
      error: null,
      pendingClerkProfile: false,
      justProvisioned: false,
      clerkSyncNonce: 0,
    });
  });

  it("loads a mapped client and applies them to the session", async () => {
    mockMe.mockResolvedValue(client);

    const result = await syncClerkToGridgo({ getToken, signOut, sessionId: "sess_1" });

    expect(result).toEqual({ kind: "adopt", user: client, provisioned: false });
    expect(useSession.getState().user?.id).toBe("u1");
    expect(useSession.getState().justProvisioned).toBe(false);
    expect(signOut).not.toHaveBeenCalled();
    expect(mockSetTokenProvider).toHaveBeenCalled();
  });

  it("does not treat an already-mapped client as first-run onboarding", async () => {
    mockMe.mockResolvedValue(client);

    await syncClerkToGridgo({ getToken, signOut, sessionId: "sess_1" });

    expect(useSession.getState().justProvisioned).toBe(false);
  });

  it("holds a profile-complete lockup on the complete-profile route", async () => {
    mockMe.mockResolvedValue({ ...client, accountType: undefined });

    const result = await syncClerkToGridgo({ getToken, signOut, sessionId: "sess_1" });

    expect(result.kind).toBe("needs_profile");
    expect(useSession.getState().user).toBeNull();
    expect(useSession.getState().pendingClerkProfile).toBe(true);
    expect(signOut).not.toHaveBeenCalled();
  });

  it("does not wipe a client already applied by login when a later sync fails", async () => {
    useSession.getState().adoptClerkUser(client);
    const network = new Error("Network request failed");
    network.name = "TypeError";
    mockMe.mockRejectedValue(network);

    const result = await syncClerkToGridgo({ getToken, signOut, sessionId: "sess_1" });

    expect(result.kind).toBe("error");
    expect(useSession.getState().user?.id).toBe("u1");
    expect(useSession.getState().error).toBeNull();
  });

  it("waits for the first JWT of a new session instead of probing unauthenticated", async () => {
    getToken.mockReset();
    getToken
      .mockResolvedValueOnce(null as unknown as string)
      .mockResolvedValue("clerk-jwt");
    mockMe.mockResolvedValue(client);

    const result = await syncClerkToGridgo({ getToken, signOut, sessionId: "sess_1" });

    expect(result).toEqual({ kind: "adopt", user: client, provisioned: false });
    expect(useSession.getState().error).toBeNull();
    expect(mockMe).toHaveBeenCalledTimes(1);
  });

  it("never says the session expired when Clerk hands over no token at all", async () => {
    getToken.mockReset().mockResolvedValue(null as unknown as string);

    const result = await syncClerkToGridgo({ getToken, signOut, sessionId: "sess_1" });

    expect(result.kind).toBe("error");
    expect(mockMe).not.toHaveBeenCalled();
    expect(mockActivate).not.toHaveBeenCalled();
    const message = useSession.getState().error ?? "";
    expect(message).not.toMatch(/expired/i);
    expect(message).toMatch(/never received an identity token/i);
    expect(signOut).not.toHaveBeenCalled();
  });

  it("offers sign-out, not an expiry, when the API refuses a live Clerk token", async () => {
    const unauthorized = new ApiError(401, { error: "unauthorized" });
    mockMe.mockRejectedValue(unauthorized);
    mockActivate.mockRejectedValue(unauthorized);

    const result = await syncClerkToGridgo({ getToken, signOut, sessionId: "sess_1" });

    expect(result.kind).toBe("error");
    expect(mockActivate).toHaveBeenCalledTimes(1);
    const message = useSession.getState().error ?? "";
    expect(message).not.toMatch(/expired/i);
    expect(message).toMatch(/could not verify/i);
    expect(useSession.getState().user).toBeNull();
    expect(useSession.getState().loading).toBe(false);
    // Clerk stays signed in; the person presses the recovery themselves.
    expect(signOut).not.toHaveBeenCalled();
  });

  it("keeps wrong-role recovery available when Clerk sign-out fails", async () => {
    mockMe.mockResolvedValue({ ...client, role: "supplier" });
    signOut.mockRejectedValue(new Error("Clerk is unavailable"));

    await expect(
      syncClerkToGridgo({ getToken, signOut, sessionId: "sess_1" }),
    ).resolves.toEqual({ kind: "wrong_role", role: "supplier" });

    expect(useSession.getState().loading).toBe(false);
    expect(useSession.getState().user).toBeNull();
    expect(useSession.getState().error).toBe(
      "This email is not available. Try a different email.",
    );
  });

  it("does not let an older failure erase a newer profile requirement", async () => {
    let rejectOlder!: (reason: unknown) => void;
    mockMe
      .mockImplementationOnce(
        () =>
          new Promise((_resolve, reject) => {
            rejectOlder = reject;
          }),
      )
      .mockResolvedValueOnce({ ...client, accountType: undefined });

    const olderPromise = syncClerkToGridgo({
      getToken,
      signOut,
      sessionId: "sess_older",
    });
    await syncClerkToGridgo({ getToken, signOut, sessionId: "sess_newer" });

    const network = new Error("Network request failed");
    network.name = "TypeError";
    rejectOlder(network);
    await olderPromise;

    expect(useSession.getState().user).toBeNull();
    expect(useSession.getState().pendingClerkProfile).toBe(true);
    expect(useSession.getState().error).toBeNull();
  });

  it("coalesces a no-ID sync when the same Clerk session ID appears", async () => {
    let resolveClient!: (user: User) => void;
    const firstGetToken = jest.fn(async () => "clerk-jwt");
    const identifiedGetToken = jest.fn(async () => "clerk-jwt");
    const network = new Error("Network request failed");
    network.name = "TypeError";
    // The sync waits for a JWT before it calls /auth/me, so the resolver only
    // exists once that call has really been made — wait for it rather than
    // assuming the request went out in the same tick.
    const meCalled = new Promise<void>((called) => {
      mockMe
        .mockImplementationOnce(
          () =>
            new Promise<User>((resolve) => {
              resolveClient = resolve;
              called();
            }),
        )
        .mockRejectedValueOnce(network);
    });

    const first = syncClerkToGridgo({ getToken: firstGetToken, signOut });
    const second = syncClerkToGridgo({
      getToken: identifiedGetToken,
      signOut,
      sessionId: "sess_shared",
    });
    await meCalled;
    resolveClient(client);

    await expect(Promise.all([first, second])).resolves.toEqual([
      { kind: "adopt", user: client, provisioned: false },
      { kind: "adopt", user: client, provisioned: false },
    ]);
    expect(mockMe).toHaveBeenCalledTimes(1);
    expect(useSession.getState().user?.id).toBe("u1");
    expect(useSession.getState().error).toBeNull();
  });
});

/**
 * `beginClerkSync` raises `session.loading` and only a *result* used to lower
 * it, so any sync that was abandoned left the flag raised with nothing alive
 * to clear it. Zustand outlives the screen, so it survived Fast Refresh and a
 * return to the login form — where Sign In was disabled on that flag. That is
 * how "after using the app they cannot tap login again" happened.
 */
describe("the sync never leaves the app waiting", () => {
  const getToken = jest.fn(async () => "clerk-jwt");
  const signOut = jest.fn(async () => undefined);

  beforeEach(() => {
    invalidateClerkGridgoSync();
    getToken.mockReset().mockResolvedValue("clerk-jwt");
    signOut.mockReset().mockResolvedValue(undefined);
    mockMe.mockReset();
    mockActivate.mockReset();
    mockSetTokenProvider.mockReset();
    useSession.setState({
      user: null,
      source: null,
      loading: false,
      error: null,
      pendingClerkProfile: false,
      justProvisioned: false,
      signingOut: false,
      clerkSyncNonce: 0,
    });
  });

  it("stops waiting when the sync is abandoned mid-flight", async () => {
    mockMe.mockReturnValue(new Promise<never>(() => {}));

    void syncClerkToGridgo({ getToken, signOut }).catch(() => undefined);
    await Promise.resolve();
    expect(useSession.getState().loading).toBe(true);

    // What sign-out does: `useClerkApiSession` invalidates on the signed-out
    // leg, orphaning whatever was in flight.
    invalidateClerkGridgoSync();

    expect(useSession.getState().loading).toBe(false);
  });

  it("stops waiting when the sync throws instead of answering", async () => {
    mockMe.mockRejectedValue(new Error("the network went away"));

    await syncClerkToGridgo({ getToken, signOut }).catch(() => undefined);

    expect(useSession.getState().loading).toBe(false);
  });

  it("stops waiting when the token never arrives", async () => {
    getToken.mockResolvedValue(null as unknown as string);

    await syncClerkToGridgo({ getToken, signOut }).catch(() => undefined);

    expect(useSession.getState().loading).toBe(false);
  });

  it("does not let an abandoned sync clear the wait belonging to the one that replaced it", async () => {
    let failFirst!: (reason: unknown) => void;
    mockMe
      .mockImplementationOnce(
        () =>
          new Promise<User>((_resolve, reject) => {
            failFirst = reject;
          }),
      )
      .mockReturnValue(new Promise<never>(() => {}));

    void syncClerkToGridgo({ getToken, signOut, sessionId: "sess_one" }).catch(
      () => undefined,
    );
    await Promise.resolve();
    void syncClerkToGridgo({ getToken, signOut, sessionId: "sess_two" }).catch(
      () => undefined,
    );
    await Promise.resolve();
    await Promise.resolve();
    expect(useSession.getState().loading).toBe(true);

    failFirst(new Error("abandoned"));
    await Promise.resolve();
    await Promise.resolve();

    // The second sync is still running, so the app is still waiting on it.
    expect(useSession.getState().loading).toBe(true);
  });
});

describe("endClerkSync", () => {
  it("only lowers the wait, and touches nothing else", () => {
    useSession.setState({ loading: true, error: "kept", user: null });
    useSession.getState().endClerkSync();

    expect(useSession.getState().loading).toBe(false);
    expect(useSession.getState().error).toBe("kept");
  });

  it("is safe to call when nothing is waiting", () => {
    useSession.setState({ loading: false });
    useSession.getState().endClerkSync();
    expect(useSession.getState().loading).toBe(false);
  });
});
