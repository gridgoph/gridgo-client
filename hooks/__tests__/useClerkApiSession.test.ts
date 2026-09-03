import { act, renderHook, waitFor } from "@testing-library/react-native";

import { useClerkApiSession } from "@/hooks/useClerkApiSession";
import { ApiError, type User } from "@/lib/api";
import { useLoginFlow } from "@/store/loginFlow";
import { useSession } from "@/store/session";
import { useSignupFlow } from "@/store/signupFlow";

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
    sessionClaims: null,
  }),
  useClerk: () => ({ signOut: mockSignOut }),
  useUser: () => ({ user: null, isLoaded: true }),
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
    useLoginFlow.getState().reset();
    useSignupFlow.getState().reset();
    useSession.setState({
      user: null,
      source: null,
      loading: false,
      error: null,
      pendingClerkProfile: false,
      justProvisioned: false,
      clerkSyncNonce: 0,
      signingOut: false,
    });
    useSession.getState().registerIdentityLogout(null);
  });

  it("does not re-join a refused identity and keep Signing you in", async () => {
    mockMe.mockResolvedValue(supplier);
    useSession.setState({
      error: "This email is not available. Try a different email.",
    });

    renderHook(() => useClerkApiSession());

    await waitFor(() => {
      expect(useSession.getState().loading).toBe(false);
    });
    expect(mockMe).not.toHaveBeenCalled();
    expect(mockSignOut).not.toHaveBeenCalled();
    expect(useSession.getState().sessionWait).not.toBe("in");
  });

  it("signs out of Clerk when the mapped identity is the wrong role", async () => {
    mockMe.mockResolvedValue(supplier);

    renderHook(() => useClerkApiSession());

    await waitFor(() => expect(mockSignOut).toHaveBeenCalled());
    expect(useSession.getState().user).toBeNull();
    expect(useSession.getState().error).toBe(
      "This email is not available. Try a different email.",
    );
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

    await waitFor(() => expect(mockSignOut).toHaveBeenCalled(), { timeout: 8000 });
    expect(mockMe).not.toHaveBeenCalled();
    expect(mockActivate).not.toHaveBeenCalled();
    expect(useSession.getState().user).toBeNull();
    expect(useSession.getState().error).toBeNull();
    expect(useSession.getState().loading).toBe(false);
  });

  it("installs a token provider that reads Clerk's cache instead of minting per request", async () => {
    mockMe.mockResolvedValue({
      id: "u1",
      email: "ana@company.com",
      name: "Ana",
      role: "client",
      accountType: "individual",
    });

    renderHook(() => useClerkApiSession());

    await waitFor(() => expect(mockSetTokenProvider).toHaveBeenCalled());
    const provider = mockSetTokenProvider.mock.calls.at(-1)?.[0] as (options?: {
      force?: boolean;
    }) => Promise<string | null>;

    // Every ordinary request: one cached read, no Clerk FAPI round trip.
    mockGetToken.mockClear();
    await expect(provider()).resolves.toBe("clerk-jwt");
    expect(mockGetToken).toHaveBeenCalledTimes(1);
    expect(mockGetToken).toHaveBeenCalledWith(undefined);
    expect(mockGetToken).not.toHaveBeenCalledWith({ skipCache: true });

    // Only gridgo-api refusing the bearer buys a forced mint.
    mockGetToken.mockClear();
    await expect(provider({ force: true })).resolves.toBe("clerk-jwt");
    expect(mockGetToken).toHaveBeenCalledTimes(1);
    expect(mockGetToken).toHaveBeenCalledWith({ skipCache: true });
  });

  it("falls back to one mint when Clerk's cache is empty, so no request goes out bare", async () => {
    mockMe.mockResolvedValue({
      id: "u1",
      email: "ana@company.com",
      name: "Ana",
      role: "client",
      accountType: "individual",
    });

    renderHook(() => useClerkApiSession());

    await waitFor(() => expect(mockSetTokenProvider).toHaveBeenCalled());
    const provider = mockSetTokenProvider.mock.calls.at(-1)?.[0] as (options?: {
      force?: boolean;
    }) => Promise<string | null>;

    mockGetToken.mockClear();
    mockGetToken.mockResolvedValueOnce(null).mockResolvedValue("clerk-jwt");
    await expect(provider()).resolves.toBe("clerk-jwt");
    expect(mockGetToken).toHaveBeenNthCalledWith(1, undefined);
    expect(mockGetToken).toHaveBeenNthCalledWith(2, { skipCache: true });
    expect(mockGetToken).toHaveBeenCalledTimes(2);
  });

  it("does not join a leftover identity while login is collecting a code", async () => {
    mockMe.mockResolvedValue(supplier);
    useLoginFlow.getState().enterVerification("email_code");

    renderHook(() => useClerkApiSession());

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(mockMe).not.toHaveBeenCalled();
    expect(mockSignOut).not.toHaveBeenCalled();
    expect(useSession.getState().error).toBeNull();
  });

  it("does not restore a leftover Clerk session while signing out", async () => {
    mockMe.mockResolvedValue({
      id: "u-old",
      email: "old@gridgo.ph",
      name: "Old",
      role: "client",
      accountType: "individual",
    });
    useSession.setState({ signingOut: true });

    renderHook(() => useClerkApiSession());

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(mockMe).not.toHaveBeenCalled();
    expect(useSession.getState().user).toBeNull();
    expect(mockSignOut).not.toHaveBeenCalled();
  });

  it("keeps the sign-out latch after Clerk has left so ranking cannot flash", async () => {
    mockIsSignedIn = false;
    mockSessionId = null;
    useSession.setState({ signingOut: true, user: null });

    renderHook(() => useClerkApiSession());

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(useSession.getState().signingOut).toBe(true);
    expect(useSession.getState().user).toBeNull();
    expect(mockMe).not.toHaveBeenCalled();
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
