import { ApiError, type User } from "@/lib/api";
import { syncClerkToGridgo } from "@/lib/clerkGridgoSync";
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

  it("keeps wrong-role recovery available when Clerk sign-out fails", async () => {
    mockMe.mockResolvedValue({ ...client, role: "supplier" });
    signOut.mockRejectedValue(new Error("Clerk is unavailable"));

    await expect(
      syncClerkToGridgo({ getToken, signOut, sessionId: "sess_1" }),
    ).resolves.toEqual({ kind: "wrong_role", role: "supplier" });

    expect(useSession.getState().loading).toBe(false);
    expect(useSession.getState().user).toBeNull();
    expect(useSession.getState().error).toMatch(/GRIDGO Supplier/);
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

  it("coalesces same-session syncs so a valid client adoption wins", async () => {
    let resolveClient!: (user: User) => void;
    const network = new Error("Network request failed");
    network.name = "TypeError";
    mockMe
      .mockImplementationOnce(
        () =>
          new Promise<User>((resolve) => {
            resolveClient = resolve;
          }),
      )
      .mockRejectedValueOnce(network);

    const first = syncClerkToGridgo({ getToken, signOut, sessionId: "sess_shared" });
    const second = syncClerkToGridgo({ getToken, signOut, sessionId: "sess_shared" });
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
