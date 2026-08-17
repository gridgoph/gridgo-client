import { renderHook, waitFor } from "@testing-library/react-native";

import { useClerkApiSession } from "@/hooks/useClerkApiSession";
import { ApiError, type User } from "@/lib/api";
import { useSession } from "@/store/session";

const mockGetToken = jest.fn(
  async (_options?: { skipCache?: boolean }): Promise<string | null> => "clerk-jwt",
);
const mockSignOut = jest.fn(async () => undefined);
const mockMe = jest.fn();
const mockActivate = jest.fn();
const mockSetTokenProvider = jest.fn();
let mockAuthGetToken = mockGetToken;
let mockIsSignedIn = true;
let mockSessionId: string | null = "sess_1";

jest.mock("@clerk/expo", () => ({
  useAuth: () => ({
    getToken: mockAuthGetToken,
    isLoaded: true,
    isSignedIn: mockIsSignedIn,
    sessionId: mockSessionId,
  }),
  useClerk: () => ({ signOut: mockSignOut }),
}));

jest.mock("@/lib/api", () => {
  const actual = jest.requireActual("@/lib/api");
  return {
    ...actual,
    me: (...args: unknown[]) => mockMe(...args),
    activateClerkClient: (...args: unknown[]) => mockActivate(...args),
    setTokenProvider: (...args: unknown[]) => mockSetTokenProvider(...args),
  };
});

const supplier: User = {
  id: "u-sup",
  email: "shop@gridgo.ph",
  name: "Shop",
  role: "supplier",
};

describe("useClerkApiSession", () => {
  beforeEach(() => {
    mockGetToken.mockReset().mockResolvedValue("clerk-jwt");
    mockAuthGetToken = mockGetToken;
    mockIsSignedIn = true;
    mockSessionId = "sess_1";
    mockSignOut.mockClear();
    mockSetTokenProvider.mockClear();
    mockMe.mockReset();
    mockActivate.mockReset();
    useSession.setState({
      user: null,
      source: null,
      loading: false,
      error: null,
      pendingClerkProfile: false,
      justProvisioned: false,
      clerkSyncNonce: 0,
    });
    useSession.getState().registerIdentityLogout(null);
  });

  it("signs out of Clerk when the mapped identity is the wrong role", async () => {
    mockMe.mockResolvedValue(supplier);

    renderHook(() => useClerkApiSession());

    await waitFor(() => expect(mockSignOut).toHaveBeenCalled());
    expect(useSession.getState().user).toBeNull();
    expect(useSession.getState().error).toMatch(/GRIDGO Supplier/);
  });

  it("activates then adopts a new Google client", async () => {
    const client: User = {
      id: "u1",
      email: "ana@company.com",
      name: "Ana",
      role: "client",
      accountType: "individual",
    };
    mockMe
      .mockRejectedValueOnce(new ApiError(401, { error: "unauthorized" }))
      .mockResolvedValueOnce(client);
    mockActivate.mockResolvedValue(client);

    renderHook(() => useClerkApiSession());

    await waitFor(() => expect(useSession.getState().user?.id).toBe("u1"));
    expect(mockActivate).toHaveBeenCalled();
    expect(mockSignOut).not.toHaveBeenCalled();
    expect(useSession.getState().justProvisioned).toBe(true);
    expect(mockGetToken).toHaveBeenCalledWith({ skipCache: true });
  });

  it("signs out a leftover session that cannot mint a JWT instead of failing login", async () => {
    mockGetToken.mockResolvedValue(null);

    renderHook(() => useClerkApiSession());

    await waitFor(() => expect(mockSignOut).toHaveBeenCalled());
    expect(mockMe).not.toHaveBeenCalled();
    expect(mockActivate).not.toHaveBeenCalled();
    expect(useSession.getState().user).toBeNull();
    expect(useSession.getState().error).toBeNull();
    expect(useSession.getState().loading).toBe(false);
  });

  it("installs a token provider that always asks Clerk for a fresh JWT", async () => {
    mockMe.mockResolvedValue({
      id: "u1",
      email: "ana@company.com",
      name: "Ana",
      role: "client",
      accountType: "individual",
    });

    renderHook(() => useClerkApiSession());

    await waitFor(() => expect(mockSetTokenProvider).toHaveBeenCalled());
    const provider = mockSetTokenProvider.mock.calls.at(-1)?.[0] as () => Promise<string | null>;
    mockGetToken.mockClear();
    await provider();
    expect(mockGetToken).toHaveBeenCalledWith({ skipCache: true });
  });

  it("preserves an adopted client while Clerk still exposes the session ID", async () => {
    const client: User = {
      id: "u1",
      email: "ana@company.com",
      name: "Ana",
      role: "client",
      accountType: "individual",
    };
    mockIsSignedIn = false;
    mockMe.mockResolvedValue(client);
    useSession.getState().adoptClerkUser(client);

    const { rerender } = await renderHook(() => useClerkApiSession());
    await waitFor(() => expect(useSession.getState().user?.id).toBe("u1"));

    mockAuthGetToken = jest.fn(async () => "clerk-jwt");
    await rerender({});

    await waitFor(() => expect(useSession.getState().user?.id).toBe("u1"));
    expect(useSession.getState().source).toBe("clerk");
    expect(mockSignOut).not.toHaveBeenCalled();
  });
});
