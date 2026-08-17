import type { User } from "@/lib/api";
import { completeClerkAuth, withSettledClerkSession } from "@/lib/clerkComplete";
import { useSession } from "@/store/session";

const mockMe = jest.fn();
const mockActivate = jest.fn();

jest.mock("@/lib/api", () => {
  const actual = jest.requireActual("@/lib/api");
  return {
    ...actual,
    me: (...args: unknown[]) => mockMe(...args),
    activateClerkClient: (...args: unknown[]) => mockActivate(...args),
    setTokenProvider: jest.fn(),
  };
});

const client: User = {
  id: "u-client",
  email: "ana@company.com",
  name: "Ana Santos",
  role: "client",
  accountType: "individual",
};

const getToken = jest.fn(async () => "clerk-jwt");
const signOut = jest.fn(async () => undefined);
const setActive = jest.fn(async () => undefined);

const alreadySignedIn = { errors: [{ message: "You're already signed in." }] };

describe("completeClerkAuth", () => {
  beforeEach(() => {
    getToken.mockClear();
    signOut.mockClear();
    setActive.mockClear();
    mockMe.mockReset().mockResolvedValue(client);
    mockActivate.mockReset();
    useSession.setState({
      user: null,
      source: null,
      loading: false,
      error: null,
      pendingClerkProfile: false,
      justProvisioned: false,
    });
  });

  it("finalizes the Clerk flow and adopts the GRIDGO client", async () => {
    const finalize = jest.fn(async () => ({ error: null }));

    const result = await completeClerkAuth({ finalize, getToken, signOut, setActive });

    expect(finalize).toHaveBeenCalled();
    expect(result.kind).toBe("adopt");
    expect(useSession.getState().user?.id).toBe("u-client");
    expect(useSession.getState().source).toBe("clerk");
  });

  it("treats a finalize that says 'already signed in' as the session to adopt", async () => {
    const finalize = jest.fn(async () => ({ error: alreadySignedIn }));

    const result = await completeClerkAuth({ finalize, getToken, signOut, setActive });

    expect(result.kind).toBe("adopt");
    expect(useSession.getState().user?.id).toBe("u-client");
    expect(useSession.getState().error).toBeNull();
  });

  it("still reports a real finalize failure", async () => {
    const finalize = jest.fn(async () => ({ error: new Error("network down") }));

    await expect(
      completeClerkAuth({ finalize, getToken, signOut, setActive }),
    ).rejects.toThrow("network down");
    expect(mockMe).not.toHaveBeenCalled();
  });

  it("activates the session Clerk already had rather than finalizing", async () => {
    const finalize = jest.fn();

    const result = await completeClerkAuth({
      finalize,
      existingSessionId: "sess_leftover",
      getToken,
      signOut,
      setActive,
    });

    expect(setActive).toHaveBeenCalledWith({ session: "sess_leftover" });
    expect(finalize).not.toHaveBeenCalled();
    expect(result.kind).toBe("adopt");
    expect(useSession.getState().user?.id).toBe("u-client");
  });
});

describe("withSettledClerkSession", () => {
  it("skips the attempt entirely when the leftover session was adopted", async () => {
    const run = jest.fn();
    const settle = jest.fn(async () => "handled" as const);

    await expect(
      withSettledClerkSession({ isSignedIn: true, settle, run }),
    ).resolves.toEqual({ kind: "handled" });
    expect(settle).toHaveBeenCalledWith(true);
    expect(run).not.toHaveBeenCalled();
  });

  it("settles and retries once when Clerk says the person is currently logged in", async () => {
    const settle = jest
      .fn<Promise<"handled" | "ready">, [boolean]>()
      .mockResolvedValueOnce("ready")
      .mockResolvedValueOnce("ready");
    const run = jest
      .fn()
      .mockRejectedValueOnce(alreadySignedIn)
      .mockResolvedValueOnce("signed-in");

    await expect(withSettledClerkSession({ isSignedIn: false, settle, run })).resolves.toEqual({
      kind: "ran",
      value: "signed-in",
    });
    expect(settle).toHaveBeenNthCalledWith(1, false);
    expect(settle).toHaveBeenNthCalledWith(2, true);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("passes a real failure straight through", async () => {
    const settle = jest.fn(async () => "ready" as const);
    const run = jest.fn().mockRejectedValue(new Error("Wrong password."));

    await expect(
      withSettledClerkSession({ isSignedIn: false, settle, run }),
    ).rejects.toThrow("Wrong password.");
    expect(run).toHaveBeenCalledTimes(1);
  });
});
