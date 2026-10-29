import { act, renderHook, waitFor } from "@testing-library/react-native";

import { AppState, type AppStateStatus } from "react-native";

import { useClerkApiSession } from "@/hooks/useClerkApiSession";
import type { User } from "@/lib/api";
import { useListingDraft, type ListingDraft } from "@/store/listingDraft";
import { useLoginFlow } from "@/store/loginFlow";
import { useSession } from "@/store/session";
import { useSignupFlow } from "@/store/signupFlow";

// Clerk swapping one person's session for another's is not a re-check of the
// same client. The account on screen must go the moment it happens, even when
// the new session has no token yet, and the new person is joined once it does.
// Its own file: the rendered-hook budget in useClerkApiSession.test.ts is spent.

const mockGetToken = jest.fn(
  async (_options?: { skipCache?: boolean }): Promise<string | null> => "jwt_A",
);
const mockSignOut = jest.fn(async () => undefined);
const mockMe = jest.fn();
let mockSessionId: string | null = "sess_A";

jest.mock("@clerk/expo", () => ({
  useAuth: () => ({
    getToken: mockGetToken,
    isLoaded: true,
    isSignedIn: true,
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
    activateClerkClient: jest.fn(),
    setTokenProvider: jest.fn(),
  };
});

const ana: User = {
  id: "u_A",
  email: "ana@company.com",
  name: "Ana",
  role: "client",
  accountType: "individual",
};
const ben: User = { ...ana, id: "u_B", email: "ben@company.com", name: "Ben" };

afterEach(() => {
  jest.restoreAllMocks();
});

it("lets the previous account go when another session's token is slow, then joins it on return", async () => {
  let onAppState: ((status: AppStateStatus) => void) | undefined;
  jest.spyOn(AppState, "addEventListener").mockImplementation((_type, listener) => {
    onAppState = listener as (status: AppStateStatus) => void;
    return { remove: jest.fn() } as unknown as ReturnType<typeof AppState.addEventListener>;
  });
  useLoginFlow.getState().reset();
  useSignupFlow.getState().reset();
  const identityLogout = jest.fn(async () => undefined);
  mockMe.mockResolvedValue(ana);

  const { rerender } = await renderHook(() => useClerkApiSession());
  await waitFor(() => expect(useSession.getState().user?.id).toBe("u_A"));
  useSession.getState().registerIdentityLogout(identityLogout);
  useListingDraft.getState().keep("item_1", { quantity: 100 } as unknown as ListingDraft);

  // Clerk now holds Ben's session, and Ben's first JWT is slow.
  mockGetToken.mockReset().mockResolvedValue(null);
  mockMe.mockResolvedValue(ben);
  mockSessionId = "sess_B";
  await rerender({});

  // Ana is gone at once, with her draft, and nobody is signed out of Clerk.
  expect(useSession.getState().user).toBeNull();
  expect(useListingDraft.getState().drafts.item_1).toBeUndefined();
  await waitFor(() => expect(mockGetToken).toHaveBeenCalledTimes(10), { timeout: 8000 });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
  expect(mockMe).toHaveBeenCalledTimes(1);
  expect(useSession.getState().user).toBeNull();

  // Ben's token arrives; coming back to the app joins him.
  mockGetToken.mockResolvedValue("jwt_B");
  await act(async () => {
    onAppState?.("active");
  });

  await waitFor(() => expect(useSession.getState().user?.id).toBe("u_B"));
  expect(mockSignOut).not.toHaveBeenCalled();
  expect(identityLogout).not.toHaveBeenCalled();
});
