import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import LoginScreen from "@/app/(auth)/login";
import { APPLE_SIGN_UP_INCOMPLETE } from "@/lib/appleSignIn";
import { useSession } from "@/store/session";

const mockMe = jest.fn();

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
 * Closing Apple's sheet is not an error (one press per file's test; see
 * login-apple.test.tsx for the landing).
 */
it("says nothing when the person closes Apple's sheet", async () => {
  mockIsSignedIn = false;
  mockStartApple.mockReset().mockResolvedValue({ createdSessionId: null });
  mockSetActive.mockReset();
  useSession.setState({ user: null, loading: false, error: null, sessionWait: null, ssoInFlight: false });
  await renderInSafeArea(<LoginScreen />);

  fireEvent.press(screen.getByLabelText("Continue with Apple"));

  await waitFor(() => expect(mockStartApple).toHaveBeenCalled());
  await waitFor(() => expect(screen.getByLabelText("Continue with Apple")).toBeTruthy());
  expect(mockSetActive).not.toHaveBeenCalled();
  expect(useSession.getState().sessionWait).toBeNull();
  expect(screen.queryByText("Could not sign in")).toBeNull();
  expect(screen.queryByText("Apple sign-in did not finish. Try again.")).toBeNull();
});

it("says what is missing when Clerk cannot finish the Apple sign-up", async () => {
  mockStartApple.mockReset().mockResolvedValue({
    createdSessionId: null,
    signUp: { status: "missing_requirements", missingFields: ["phone_number"] },
  });
  await renderInSafeArea(<LoginScreen />);

  fireEvent.press(screen.getByLabelText("Continue with Apple"));

  expect(await screen.findByText(APPLE_SIGN_UP_INCOMPLETE)).toBeTruthy();
});
