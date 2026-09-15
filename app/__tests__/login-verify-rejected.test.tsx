/**
 * The API refuses a Clerk JWT that was minted seconds ago.
 *
 * `/auth/me` and `POST /auth/clerk/activate` both answer `401 unauthorized`,
 * which means the API verified nothing — an unknown authorized party, the
 * wrong instance, a skewed clock. Clerk is signed in the whole time, so
 * "your session expired, sign in again" is both untrue and unfollowable: it
 * is the dead end the captain hit on the LAN. What the person gets instead is
 * what happened, and the one control that can change it.
 */
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import LoginScreen from "@/app/(auth)/login";
import { ApiError } from "@/lib/api";
import { useSession } from "@/store/session";

const mockPassword = jest.fn();
const mockFinalize = jest.fn();
const mockGetToken = jest.fn(
  async (_options?: { skipCache?: boolean }): Promise<string | null> => "clerk-jwt",
);
const mockSetActive = jest.fn(async () => undefined);
const mockSignOut = jest.fn(async () => undefined);
const mockMe = jest.fn();
const mockActivate = jest.fn();

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

jest.mock("@/lib/api", () => {
  const actual = jest.requireActual("@/lib/api");
  return {
    ...actual,
    me: (...args: unknown[]) => mockMe(...args),
    activateClerkClient: (...args: unknown[]) => mockActivate(...args),
  };
});

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

describe("LoginScreen when the API cannot verify a just-issued Clerk token", () => {
  beforeEach(() => {
    const unauthorized = new ApiError(401, { error: "unauthorized" });
    mockPassword.mockReset().mockResolvedValue({});
    mockFinalize.mockReset().mockResolvedValue({});
    mockGetToken.mockReset().mockResolvedValue("clerk-jwt");
    mockSetActive.mockReset().mockResolvedValue(undefined);
    mockSignOut.mockReset().mockResolvedValue(undefined);
    mockMe.mockReset().mockRejectedValue(unauthorized);
    mockActivate.mockReset().mockRejectedValue(unauthorized);
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

  it("offers a retryable sign-out instead of calling the new session expired", async () => {
    await renderInSafeArea(<LoginScreen />);
    fireEvent.changeText(screen.getByLabelText("Email"), "client@gridgo.ph");
    fireEvent.changeText(screen.getByLabelText("Password"), "fixture-password");
    await waitFor(() =>
      expect(screen.getByLabelText("Password").props.value).toBe("fixture-password"),
    );

    fireEvent.press(screen.getByRole("button", { name: "Sign In" }));

    await waitFor(() => expect(screen.getByText("Could not sign in")).toBeTruthy());
    expect(mockActivate).toHaveBeenCalled();
    expect(screen.queryByText(/session expired/i)).toBeNull();
    expect(screen.queryByText(/sign in again to continue/i)).toBeNull();
    expect(screen.getByText(/could not verify that identity/i)).toBeTruthy();

    // Clerk is still signed in, so the recovery has to be able to leave it.
    const recovery = screen.getByRole("button", { name: "Sign out and try again" });
    await act(async () => {
      fireEvent.press(recovery);
    });
    expect(mockSignOut).toHaveBeenCalled();
    expect(useSession.getState().error).toBeNull();
  });
});
