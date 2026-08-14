import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import LoginScreen from "@/app/(auth)/login";
import { useSession } from "@/store/session";

const mockStartSSOFlow = jest.fn();
const mockSetActive = jest.fn();

let mockIsSignedIn = false;

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
  useAuth: () => ({ isSignedIn: mockIsSignedIn, isLoaded: true }),
  useClerk: () => ({ setActive: mockSetActive }),
}));

jest.mock("@clerk/expo/experimental", () => ({
  useSSO: () => ({ startSSOFlow: mockStartSSOFlow }),
}));

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

describe("LoginScreen Google SSO", () => {
  beforeEach(() => {
    mockIsSignedIn = false;
    mockStartSSOFlow.mockReset();
    mockSetActive.mockReset().mockResolvedValue(undefined);
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

  it("does not start SSO or throw when Clerk is already signed in", async () => {
    mockIsSignedIn = true;
    await renderInSafeArea(<LoginScreen />);

    fireEvent.press(screen.getByLabelText("Continue with Google"));

    await waitFor(() => expect(useSession.getState().clerkSyncNonce).toBe(1));
    expect(mockStartSSOFlow).not.toHaveBeenCalled();
    expect(screen.queryByText("Could not sign in")).toBeNull();
  });

  it("calls setActive when Google SSO creates a session", async () => {
    mockStartSSOFlow.mockResolvedValue({
      createdSessionId: "sess_google",
      setActive: undefined,
    });
    await renderInSafeArea(<LoginScreen />);

    fireEvent.press(screen.getByLabelText("Continue with Google"));

    await waitFor(() =>
      expect(mockSetActive).toHaveBeenCalledWith({ session: "sess_google" }),
    );
    expect(screen.queryByText("Could not sign in")).toBeNull();
  });
});
