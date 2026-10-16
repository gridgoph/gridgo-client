import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import LoginScreen from "@/app/(auth)/login";
import type { User } from "@/lib/api";
import { useSession } from "@/store/session";

const mockMe = jest.fn();
const mappedClient: User = {
  id: "u-client",
  email: "client@gridgo.ph",
  name: "Ana Santos",
  role: "client",
  accountType: "individual",
};

const mockStartSSOFlow = jest.fn();
const mockStartApple = jest.fn();
const mockSetActive = jest.fn();
const mockGetToken = jest.fn(
  async (_options?: { skipCache?: boolean }): Promise<string | null> => "clerk-jwt",
);
const mockSignOut = jest.fn(async () => undefined);

let mockIsSignedIn = false;
let mockSessionId: string | null = "sess_leftover";

jest.mock("@clerk/expo", () => ({
  useSignIn: () => ({
    signIn: {
      password: jest.fn(),
      finalize: jest.fn(),
      create: jest.fn(),
      resetPasswordEmailCode: {
        sendCode: jest.fn(),
        verifyCode: jest.fn(),
        submitPassword: jest.fn(),
      },
      status: "needs_first_factor",
    },
    fetchStatus: "idle",
  }),
  useAuth: () => ({
    isSignedIn: mockIsSignedIn,
    isLoaded: true,
    getToken: mockGetToken,
    sessionId: mockSessionId,
  }),
  useClerk: () => ({ setActive: mockSetActive, signOut: mockSignOut }),
}));

jest.mock("@clerk/expo/experimental", () => ({
  useSSO: () => ({ startSSOFlow: mockStartSSOFlow }),
}));

jest.mock("@clerk/expo/apple", () => ({
  useSignInWithApple: () => ({ startAppleAuthenticationFlow: mockStartApple }),
}));

jest.mock("@/lib/api", () => {
  const actual = jest.requireActual("@/lib/api");
  return {
    ...actual,
    me: (...args: unknown[]) => mockMe(...args),
    activateClerkClient: jest.fn(),
  };
});

jest.mock("@/components/auth/GoogleButton", () => {
  // Jest mock factories cannot use ESM imports; this is the same pattern as jest.setup.js.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Pressable, Text } = require("react-native");
  return {
    GoogleButton: ({
      onPress,
      disabled,
    }: {
      onPress: () => void;
      disabled?: boolean;
    }) => (
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

jest.mock("expo-router/react-navigation", () => ({
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

/**
 * Sign in with Apple on the login screen (iPhone; the Jest preset runs as iOS).
 *
 * One press per test: see "Running and testing" in AGENTS.md.
 */
describe("LoginScreen Sign in with Apple", () => {
  beforeEach(() => {
    mockIsSignedIn = false;
    mockSessionId = null;
    mockGetToken.mockReset().mockResolvedValue("clerk-jwt");
    mockSignOut.mockReset().mockResolvedValue(undefined);
    mockStartSSOFlow.mockReset();
    mockStartApple.mockReset();
    mockSetActive.mockReset().mockResolvedValue(undefined);
    mockMe.mockReset().mockResolvedValue(mappedClient);
    useSession.setState({
      user: null,
      loading: false,
      error: null,
      source: null,
      pendingClerkProfile: false,
      justProvisioned: false,
      signingOut: false,
      ssoInFlight: false,
      sessionWait: null,
      clerkSyncNonce: 0,
    });
  });

  it("puts Apple's button above Google's", async () => {
    await renderInSafeArea(<LoginScreen />);
    const labels = screen
      .getAllByRole("button")
      .map((button) => button.props.accessibilityLabel as string | undefined);
    expect(labels.indexOf("Continue with Apple")).toBeGreaterThan(-1);
    expect(labels.indexOf("Continue with Apple")).toBeLessThan(
      labels.indexOf("Continue with Google"),
    );
  });

  it("activates Apple's session and lands the client through GRIDGO", async () => {
    mockStartApple.mockResolvedValue({ createdSessionId: "sess_apple" });
    await renderInSafeArea(<LoginScreen />);

    fireEvent.press(screen.getByLabelText("Continue with Apple"));

    await waitFor(() => expect(mockSetActive).toHaveBeenCalledWith({ session: "sess_apple" }));
    await waitFor(() => expect(useSession.getState().user?.id).toBe("u-client"));
    expect(mockStartSSOFlow).not.toHaveBeenCalled();
    expect(screen.queryByText("Could not sign in")).toBeNull();
  });
});
