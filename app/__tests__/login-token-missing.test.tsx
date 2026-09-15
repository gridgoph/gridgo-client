/**
 * Clerk finalizes and never produces a JWT at all.
 *
 * Still not an expiry — Clerk is signed in this second, so "sign in again"
 * is advice the person cannot act on. Say that GRIDGO got no token, and leave
 * the sign-out recovery up.
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

const client = {
  id: "u1",
  email: "client@gridgo.ph",
  name: "Ana Santos",
  role: "client" as const,
  accountType: "individual" as const,
};

describe("LoginScreen when Clerk finishes but never issues a JWT", () => {
  beforeEach(() => {
    mockPassword.mockReset().mockResolvedValue({});
    mockFinalize.mockReset().mockResolvedValue({});
    mockGetToken.mockReset().mockResolvedValue(null);
    mockSetActive.mockReset().mockResolvedValue(undefined);
    mockSignOut.mockReset().mockResolvedValue(undefined);
    mockMe.mockReset().mockResolvedValue(client);
    mockActivate.mockReset();
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

  it("names the missing token and keeps the sign-out recovery, not an expiry", async () => {
    await renderInSafeArea(<LoginScreen />);
    fireEvent.changeText(screen.getByLabelText("Email"), "client@gridgo.ph");
    fireEvent.changeText(screen.getByLabelText("Password"), "fixture-password");
    await waitFor(() =>
      expect(screen.getByLabelText("Password").props.value).toBe("fixture-password"),
    );

    fireEvent.press(screen.getByRole("button", { name: "Sign In" }));

    await waitFor(() => expect(screen.getByText("Could not sign in")).toBeTruthy());
    // Nothing was ever sent without a Bearer.
    expect(mockMe).not.toHaveBeenCalled();
    expect(mockActivate).not.toHaveBeenCalled();
    expect(screen.queryByText(/session expired/i)).toBeNull();
    expect(screen.getByText(/never received an identity token/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sign out and try again" })).toBeTruthy();
  });
});
