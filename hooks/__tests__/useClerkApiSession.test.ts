import { act, renderHook, waitFor } from "@testing-library/react-native";

import { AppState, type AppStateStatus } from "react-native";

import { useClerkApiSession } from "@/hooks/useClerkApiSession";
import { ApiError, type User } from "@/lib/api";
import { useLoginFlow } from "@/store/loginFlow";
import { useSession } from "@/store/session";
import { useSignupFlow } from "@/store/signupFlow";
import { useEnrollmentConsent } from "@/store/enrollmentConsent";

const mockGetToken = jest.fn(
  async (_options?: { skipCache?: boolean }): Promise<string | null> => "clerk-jwt",
);
const mockSignOut = jest.fn(async () => undefined);
const mockMe = jest.fn();
const mockActivate = jest.fn();
const mockSetTokenProvider = jest.fn();
let mockAuthGetToken = mockGetToken;
let mockIsSignedIn = true;
let mockPrimaryRole: string | null = null;
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
  useUser: () => ({ user: mockPrimaryRole ? { publicMetadata: { gridgoRole: mockPrimaryRole } } : null, isLoaded: true }),
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
  afterEach(() => {
    jest.restoreAllMocks();
  });

  beforeEach(() => {
    mockGetToken.mockReset().mockResolvedValue("clerk-jwt");
    mockAuthGetToken = mockGetToken;
    mockIsSignedIn = true;
    mockPrimaryRole = null;
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

  it("lets the API client projection decide when Clerk names a different primary role", async () => {
    mockPrimaryRole = "supplier";
    mockMe.mockResolvedValue({ id: "multi", email: "multi@example.test", name: "Member", role: "client", accountType: "individual" });
    renderHook(() => useClerkApiSession());
    await waitFor(() => expect(useSession.getState().user?.id).toBe("multi"));
    expect(mockMe).toHaveBeenCalled();
    expect(mockSignOut).not.toHaveBeenCalled();
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

  it("finishes a sign-up whose agreement is held: activates, then adopts", async () => {
    useEnrollmentConsent.getState().hold({ kind: "legacy" });
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
    expect(useEnrollmentConsent.getState().choice).toBeNull();
  });

  it("sends a new Google identity to Finish signing up instead of enrolling it", async () => {
    useEnrollmentConsent.getState().clear();
    mockMe.mockRejectedValue(new ApiError(401, { error: "unauthorized" }));

    renderHook(() => useClerkApiSession());

    await waitFor(() => expect(useSession.getState().pendingClerkProfile).toBe(true));
    expect(mockActivate).not.toHaveBeenCalled();
    expect(useSession.getState().user).toBeNull();
  });

  it("keeps a Clerk session that has no JWT yet instead of signing it out", async () => {
    // A phone waking from the background or a file picker can answer empty for
    // a while. Signing out here ended a live session for good (#338); a
    // leftover the person wants gone is cleared by their own sign-in tap.
    mockGetToken.mockResolvedValue(null);

    renderHook(() => useClerkApiSession());

    await waitFor(() => expect(mockGetToken).toHaveBeenCalledWith({ skipCache: true }), {
      timeout: 8000,
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(mockSignOut).not.toHaveBeenCalled();
    expect(mockMe).not.toHaveBeenCalled();
    expect(useSession.getState().user).toBeNull();
    expect(useSession.getState().error).toBeNull();
    expect(useSession.getState().loading).toBe(false);
  });

  it("joins the kept session when the app comes back to the front", async () => {
    let onAppState: ((status: AppStateStatus) => void) | undefined;
    jest.spyOn(AppState, "addEventListener").mockImplementation((_type, listener) => {
      onAppState = listener as (status: AppStateStatus) => void;
      return { remove: jest.fn() } as unknown as ReturnType<typeof AppState.addEventListener>;
    });
    const client: User = {
      id: "u1",
      email: "ana@company.com",
      name: "Ana",
      role: "client",
      accountType: "individual",
    };
    mockGetToken.mockResolvedValue(null);
    mockMe.mockResolvedValue(client);

    renderHook(() => useClerkApiSession());
    // The launch join has given up: every probe of CLERK_SSO_TOKEN_WAIT spent.
    await waitFor(() => expect(mockGetToken).toHaveBeenCalledTimes(10), { timeout: 8000 });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(mockMe).not.toHaveBeenCalled();
    expect(useSession.getState().user).toBeNull();

    // Back from the file picker: Clerk has its token again.
    mockGetToken.mockResolvedValue("clerk-jwt");
    await act(async () => {
      onAppState?.("active");
    });

    await waitFor(() => expect(useSession.getState().user?.id).toBe("u1"));
    expect(mockSignOut).not.toHaveBeenCalled();
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

  it("asks /auth/me once per session however often Clerk hands over a new getToken", async () => {
    mockMe.mockResolvedValue({
      id: "u1",
      email: "ana@company.com",
      name: "Ana",
      role: "client",
      accountType: "individual",
    });

    const { rerender } = await renderHook(() => useClerkApiSession());
    await waitFor(() => expect(useSession.getState().user?.id).toBe("u1"));
    expect(mockMe).toHaveBeenCalledTimes(1);

    // An idle web session: Clerk recreates `getToken` about once a second.
    // Each of these used to re-run the sync, one `/auth/me` per tick (#173).
    for (let tick = 0; tick < 30; tick += 1) {
      mockAuthGetToken = jest.fn(async () => "clerk-jwt");
      await rerender({});
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
      });
    }

    expect(mockMe).toHaveBeenCalledTimes(1);
    expect(useSession.getState().user?.id).toBe("u1");

    // The bearer still reads the newest getToken, so a refreshed token is used.
    const latest = mockAuthGetToken;
    const provider = mockSetTokenProvider.mock.calls.at(-1)?.[0] as () => Promise<string | null>;
    await provider();
    expect(latest).toHaveBeenCalled();
  });

  it("joins again when the Clerk session id changes", async () => {
    mockMe.mockResolvedValue({
      id: "u1",
      email: "ana@company.com",
      name: "Ana",
      role: "client",
      accountType: "individual",
    });

    const { rerender } = await renderHook(() => useClerkApiSession());
    await waitFor(() => expect(useSession.getState().user?.id).toBe("u1"));
    expect(mockMe).toHaveBeenCalledTimes(1);

    mockMe.mockResolvedValue({
      id: "u2",
      email: "ben@company.com",
      name: "Ben",
      role: "client",
      accountType: "individual",
    });
    mockSessionId = "sess_2";
    await rerender({});

    await waitFor(() => expect(useSession.getState().user?.id).toBe("u2"));
    expect(mockMe).toHaveBeenCalledTimes(2);
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
