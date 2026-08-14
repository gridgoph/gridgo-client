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

let mockIsSignedIn = false;
let mockSessionId: string | null = "sess_leftover";
let mockSignInStatus = "complete";

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
      get status() {
        return mockSignInStatus;
      },
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
  useSSO: () => ({ startSSOFlow: jest.fn() }),
}));

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

describe("LoginScreen leftover password session", () => {
  beforeEach(() => {
    mockIsSignedIn = true;
    mockSessionId = "sess_leftover";
    mockSignInStatus = "complete";
    mockPassword.mockReset().mockResolvedValue({ error: null });
    mockFinalize.mockReset().mockResolvedValue({ error: null });
    mockGetToken.mockReset().mockResolvedValue(null);
    mockSetActive.mockReset().mockResolvedValue(undefined);
    mockSignOut.mockReset().mockResolvedValue(undefined);
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

  it("clears an expired leftover session then submits the password", async () => {
    await renderInSafeArea(<LoginScreen />);
    fireEvent.changeText(screen.getByLabelText("Email"), "client@gridgo.ph");
    fireEvent.changeText(screen.getByLabelText("Password"), "fixture-password");
    await waitFor(() =>
      expect(screen.getByLabelText("Password").props.value).toBe("fixture-password"),
    );

    fireEvent.press(screen.getByRole("button", { name: "Sign In" }));

    await waitFor(() => expect(mockSignOut).toHaveBeenCalled());
    await waitFor(() => expect(mockPassword).toHaveBeenCalled());
    expect(mockPassword).toHaveBeenCalledWith({
      emailAddress: "client@gridgo.ph",
      password: "fixture-password",
    });
    expect(mockFinalize).toHaveBeenCalled();
    expect(useSession.getState().clerkSyncNonce).toBe(0);
    expect(screen.queryByText("Could not sign in")).toBeNull();
    expect(screen.queryByText("You're already signed in.")).toBeNull();
  });
});
