import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
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
    isSignedIn: false,
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

describe("LoginScreen password already-signed-in refusal", () => {
  beforeEach(() => {
    mockPassword
      .mockReset()
      .mockRejectedValueOnce(new Error("You're already signed in."))
      .mockResolvedValue({ error: null });
    mockFinalize.mockReset().mockResolvedValue({ error: null });
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

  it("signs the leftover out and retries the typed password when Clerk says already signed in", async () => {
    await renderInSafeArea(<LoginScreen />);
    fireEvent.changeText(screen.getByLabelText("Email"), "client@gridgo.ph");
    fireEvent.changeText(screen.getByLabelText("Password"), "fixture-password");
    await waitFor(() =>
      expect(screen.getByLabelText("Password").props.value).toBe("fixture-password"),
    );

    fireEvent.press(screen.getByRole("button", { name: "Sign In" }));

    await waitFor(() => expect(useSession.getState().user?.id).toBe("u-client"));
    expect(useSession.getState().source).toBe("clerk");
    expect(mockPassword).toHaveBeenCalledTimes(2);
    expect(mockSignOut).toHaveBeenCalled();
    expect(screen.queryByText("Could not sign in")).toBeNull();
    expect(screen.queryByText("You're already signed in.")).toBeNull();

    mockPassword.mockReset().mockRejectedValue(new Error("You're already signed in."));
    mockGetToken.mockResolvedValue(null);
    mockSignOut.mockRejectedValue(new Error("Clerk is unavailable"));
    await act(async () => {
      useSession.setState({
        user: null,
        source: null,
        loading: false,
        error: null,
        pendingClerkProfile: false,
        justProvisioned: false,
      });
    });
    await waitFor(() => expect(screen.getByLabelText("Email")).toBeTruthy());
    fireEvent.changeText(screen.getByLabelText("Email"), "client@gridgo.ph");
    fireEvent.changeText(screen.getByLabelText("Password"), "fixture-password");

    fireEvent.press(screen.getByRole("button", { name: "Sign In" }));

    await waitFor(() => expect(screen.getByText(/could not sign you out of Clerk/i)).toBeTruthy());
    expect(mockPassword).toHaveBeenCalledTimes(1);
    expect(useSession.getState().loading).toBe(false);
    expect(screen.getByRole("button", { name: "Sign out and try again" })).toBeTruthy();
    expect(screen.queryByText("You're already signed in.")).toBeNull();
    expect(screen.queryByText(/currently logged in/i)).toBeNull();
  });
});
