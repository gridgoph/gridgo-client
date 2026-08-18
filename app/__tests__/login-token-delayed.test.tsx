/**
 * Clerk finalizes before it can mint the session's first JWT.
 *
 * `getToken` answers empty for a beat after `finalize`, and a request sent in
 * that gap carries no Bearer at all — which gridgo-api answers `401
 * unauthorized`, the same body an unmapped identity gets. The bridge used to
 * read that as a dead session and put "your session expired" under a sign-in
 * that had just succeeded. Nothing goes out until there is a token to send.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import LoginScreen from "@/app/(auth)/login";
import { useSession } from "@/store/session";

const mockPassword = jest.fn();
const mockFinalize = jest.fn();
const mockGetToken = jest.fn(
  async (_options?: { skipCache?: boolean }): Promise<string | null> => "clerk-jwt",
);
const mockSetActive = jest.fn(async () => undefined);
const mockSignOut = jest.fn(async () => undefined);

jest.mock("@clerk/expo", () => ({
  useSignIn: () => ({
    signIn: {
      password: (...args: unknown[]) => mockPassword(...args),
      finalize: (...args: unknown[]) => mockFinalize(...args),
      create: jest.fn(),
      resetPasswordEmailCode: {
        sendCode: jest.fn(),
        verifyCode: jest.fn(),
        submitPassword: jest.fn(),
      },
      status: "complete",
    },
    fetchStatus: "idle",
  }),
  useAuth: () => ({
    isSignedIn: false,
    isLoaded: true,
    getToken: mockGetToken,
    sessionId: null,
  }),
  useClerk: () => ({ setActive: mockSetActive, signOut: mockSignOut }),
}));

jest.mock("@clerk/expo/experimental", () => ({
  useSSO: () => ({ startSSOFlow: jest.fn() }),
}));

jest.mock("@/components/auth/GoogleButton", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Pressable, Text } = require("react-native");
  return {
    GoogleButton: ({ onPress, disabled }: { onPress: () => void; disabled?: boolean }) => (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Continue with Google"
        onPress={onPress}
        disabled={disabled}
      >
        <Text>Continue with Google</Text>
      </Pressable>
    ),
  };
});

jest.mock("expo-router", () => ({
  Redirect: () => null,
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    canGoBack: () => true,
  }),
}));

jest.mock("@react-navigation/native", () => ({
  usePreventRemove: jest.fn(),
}));

function renderInSafeArea(ui: ReactElement) {
  return render(ui, {
    wrapper: ({ children }) => (
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 390, height: 844 },
          insets: { top: 47, left: 0, right: 0, bottom: 34 },
        }}
      >
        {children}
      </SafeAreaProvider>
    ),
  });
}

const client = {
  id: "u1",
  email: "client@gridgo.ph",
  name: "Ana Santos",
  role: "client" as const,
  accountType: "individual" as const,
};

type Call = { path: string; authorization: string | undefined };

let requested: Call[] = [];

/**
 * gridgo-api as it really answers: no Bearer is `401 unauthorized`, which is
 * byte-for-byte what an unmapped identity gets. Mocking `api.me` instead would
 * hide the bug, because a stub returns the client whether or not a token was
 * ever sent.
 */
function stubApi(): jest.SpyInstance {
  return jest.spyOn(global, "fetch").mockImplementation(async (input, init) => {
    const path = String(input);
    const headers = (init?.headers ?? {}) as Record<string, string>;
    const authorization = headers.Authorization;
    requested.push({ path, authorization });
    if (!authorization) {
      return {
        ok: false,
        status: 401,
        text: async () => JSON.stringify({ error: "unauthorized" }),
      } as Response;
    }
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ user: client }),
    } as Response;
  });
}

describe("LoginScreen when Clerk mints the session JWT a tick late", () => {
  beforeEach(() => {
    mockPassword.mockReset().mockResolvedValue({});
    mockFinalize.mockReset().mockResolvedValue({});
    // Empty right after finalize, then the real token — the race the phone hit.
    mockGetToken
      .mockReset()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce("")
      .mockResolvedValue("clerk-jwt");
    mockSetActive.mockReset().mockResolvedValue(undefined);
    mockSignOut.mockReset().mockResolvedValue(undefined);
    requested = [];
    useSession.setState({
      user: null,
      loading: false,
      error: null,
      source: null,
      pendingClerkProfile: false,
      justProvisioned: false,
      clerkSyncNonce: 0,
    });
    stubApi();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("waits for the token and adopts the client instead of showing an expiry", async () => {
    await renderInSafeArea(<LoginScreen />);
    fireEvent.changeText(screen.getByLabelText("Email"), "client@gridgo.ph");
    fireEvent.changeText(screen.getByLabelText("Password"), "fixture-password");
    await waitFor(() =>
      expect(screen.getByLabelText("Password").props.value).toBe("fixture-password"),
    );

    fireEvent.press(screen.getByRole("button", { name: "Sign In" }));

    await waitFor(() => expect(useSession.getState().user?.id).toBe("u1"));
    expect(mockFinalize).toHaveBeenCalled();
    // Every request that went out carried a Bearer, so the API never saw the
    // unauthenticated probe that used to be mistaken for a dead session.
    expect(requested.length).toBeGreaterThan(0);
    expect(requested.every((call) => call.authorization === "Bearer clerk-jwt")).toBe(true);
    expect(requested.some((call) => call.path.endsWith("/auth/clerk/activate"))).toBe(false);
    expect(useSession.getState().error).toBeNull();
    expect(screen.queryByText("Could not sign in")).toBeNull();
    expect(screen.queryByText(/session expired/i)).toBeNull();
  });
});
