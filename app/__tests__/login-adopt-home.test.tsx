import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import LoginScreen from "@/app/(auth)/login";
import type { User } from "@/lib/api";
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

const client: User = {
  id: "u-client",
  email: "client@gridgo.ph",
  name: "Ana Santos",
  role: "client",
  accountType: "individual",
};

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
    activateClerkClient: (...args: unknown[]) => mockActivate(...args),
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

jest.mock("expo-router", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require("react");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Text } = require("react-native");
  return {
    Redirect: ({ href }: { href: unknown }) => {
      const value = typeof href === "string" ? href : JSON.stringify(href);
      return React.createElement(Text, { testID: "redirect" }, value);
    },
    useRouter: () => ({
      push: jest.fn(),
      replace: jest.fn(),
      back: jest.fn(),
      canGoBack: () => true,
    }),
  };
});

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

describe("LoginScreen leftover Clerk session for the typed email", () => {
  beforeEach(() => {
    mockPassword.mockReset();
    mockFinalize.mockReset();
    mockGetToken.mockReset().mockResolvedValue("clerk-jwt");
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

  /**
   * The leftover on this phone *is* the email being typed, signed in as a
   * client right now. Adopt it and land Home. Signing it out first bought a
   * sign-out round trip, a fresh password attempt and a new JWT mint — and
   * `getToken` answered empty in the gap between them, which is what the
   * captain saw as "GRIDGO never received an identity token for that session".
   *
   * A leftover belonging to a *different* account is still never adopted;
   * that guard lives in `login-leftover-other-account.test.tsx`.
   */
  it("adopts it instead of signing it out and replaying the password", async () => {
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
    expect(mockSignOut).not.toHaveBeenCalled();
    expect(mockPassword).not.toHaveBeenCalled();
    expect(mockFinalize).not.toHaveBeenCalled();
    expect(mockActivate).not.toHaveBeenCalled();
    expect(mockMe).toHaveBeenCalled();
    expect(useSession.getState().source).toBe("clerk");
    expect(screen.getByTestId("redirect").props.children).toBe("/(tabs)/home");
    expect(screen.queryByText("Could not sign in")).toBeNull();
    expect(screen.queryByText(/never received an identity token/i)).toBeNull();
    expect(screen.queryByText("You're already signed in.")).toBeNull();
    expect(screen.queryByText(/currently logged in/i)).toBeNull();
  });
});
