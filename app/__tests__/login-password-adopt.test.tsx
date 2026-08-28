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
    isSignedIn: true,
    isLoaded: true,
    getToken: mockGetToken,
    sessionId: "sess_leftover",
  }),
  useClerk: () => ({ setActive: mockSetActive, signOut: mockSignOut }),
}));

jest.mock("@clerk/expo/experimental", () => ({
  useSSO: () => ({ startSSOFlow: jest.fn() }),
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

describe("LoginScreen password sign-in with a live session for the same email", () => {
  beforeEach(() => {
    mockPassword.mockReset();
    mockFinalize.mockReset();
    mockGetToken.mockReset().mockResolvedValue("clerk-jwt");
    mockSetActive.mockReset().mockResolvedValue(undefined);
    mockSignOut.mockReset().mockResolvedValue(undefined);
    mockMe.mockReset().mockResolvedValue(mappedClient);
    useSession.setState({
      user: null,
      loading: false,
      error: null,
      source: null,
      pendingClerkProfile: false,
      justProvisioned: false,
      clerkSyncNonce: 0,
    });
  });

  /**
   * The round-trip budget, not just the outcome. A tap that lands Home must
   * not spend a Clerk sign-out, a password attempt, a finalize and several
   * forced JWT mints when the phone already holds a live client session for
   * this exact email — that pile of round trips is what "authentication takes
   * too long" was, and the empty `getToken` in the middle of it is what came
   * out as the token error.
   */
  it("adopts without a sign-out, a password round trip, or a forced JWT mint", async () => {
    mockPassword.mockResolvedValue({ error: null });
    mockFinalize.mockResolvedValue({ error: null });
    await renderInSafeArea(<LoginScreen />);
    fireEvent.changeText(screen.getByLabelText("Email"), "client@gridgo.ph");
    fireEvent.changeText(screen.getByLabelText("Password"), "fixture-password");
    await waitFor(() =>
      expect(screen.getByLabelText("Password").props.value).toBe("fixture-password"),
    );

    fireEvent.press(screen.getByRole("button", { name: "Sign In" }));

    await waitFor(() => expect(useSession.getState().user?.id).toBe("u-client"));
    expect(useSession.getState().source).toBe("clerk");
    expect(mockSignOut).not.toHaveBeenCalled();
    expect(mockPassword).not.toHaveBeenCalled();
    // Clerk already has a token for this session; nothing here needs a mint.
    expect(mockGetToken).not.toHaveBeenCalledWith({ skipCache: true });
    expect(screen.queryByText("Could not sign in")).toBeNull();
    expect(screen.queryByText(/never received an identity token/i)).toBeNull();
    expect(screen.queryByText("You're already signed in.")).toBeNull();
  });
});
