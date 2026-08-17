import { ApiError, type User } from "@/lib/api";
import { applyClerkGridgoResult, loadClerkGridgoUser } from "@/lib/clerkGridgoSync";
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

    const result = await loadClerkGridgoUser(getToken);
    await applyClerkGridgoResult(result, signOut);

    expect(result).toEqual({ kind: "adopt", user: client, provisioned: false });
    expect(useSession.getState().user?.id).toBe("u1");
    expect(useSession.getState().justProvisioned).toBe(false);
    expect(signOut).not.toHaveBeenCalled();
    expect(mockSetTokenProvider).toHaveBeenCalled();
  });

  it("does not treat an already-mapped client as first-run onboarding", async () => {
    mockMe.mockResolvedValue(client);

    const result = await loadClerkGridgoUser(getToken);
    await applyClerkGridgoResult(result, signOut);

    expect(useSession.getState().justProvisioned).toBe(false);
  });

  it("holds a profile-complete lockup on the complete-profile route", async () => {
    mockMe.mockResolvedValue({ ...client, accountType: undefined });

    const result = await loadClerkGridgoUser(getToken);
    await applyClerkGridgoResult(result, signOut);

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

    const result = await loadClerkGridgoUser(getToken);
    await applyClerkGridgoResult(result, signOut);

    expect(result.kind).toBe("error");
    expect(useSession.getState().user?.id).toBe("u1");
    expect(useSession.getState().error).toBeNull();
  });
});
