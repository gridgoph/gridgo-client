import { renderHook, waitFor } from "@testing-library/react-native";

import { useClerkApiSession } from "@/hooks/useClerkApiSession";
import { ApiError, type User } from "@/lib/api";
import { useSession } from "@/store/session";

const mockSignOut = jest.fn(async () => undefined);
const mockMe = jest.fn();
const mockActivate = jest.fn();

jest.mock("@clerk/expo", () => ({
  useAuth: () => ({
    getToken: async () => "clerk-jwt",
    isLoaded: true,
    isSignedIn: true,
    sessionId: "sess_1",
  }),
  useClerk: () => ({ signOut: mockSignOut }),
}));

jest.mock("@/lib/api", () => {
  const actual = jest.requireActual("@/lib/api");
  return {
    ...actual,
    me: (...args: unknown[]) => mockMe(...args),
    activateClerkClient: (...args: unknown[]) => mockActivate(...args),
    setTokenProvider: jest.fn(),
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
    mockSignOut.mockClear();
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
  });
});
