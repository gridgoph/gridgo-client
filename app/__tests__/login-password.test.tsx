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

const mockCreate = jest.fn();
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
      create: (...args: unknown[]) => mockCreate(...args),
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

// The completed sign-in adopts the GRIDGO client, so the projection has to be
// answered here — an unmocked `/auth/me` would reach the network and the test
// would pass or fail on whether a local API happened to be up.
jest.mock("@/lib/api", () => {
  const actual = jest.requireActual("@/lib/api");
  return {
    ...actual,
    me: (...args: unknown[]) => mockMe(...args),
    activateClerkClient: jest.fn(),
    setTokenProvider: jest.fn(),
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

describe("LoginScreen leftover password session", () => {
  beforeEach(() => {
    mockIsSignedIn = true;
    mockSessionId = "sess_leftover";
    mockSignInStatus = "complete";
    // The leftover cannot mint a JWT; the password sign-in that replaces it
    // can. Modelling that swap matters: nothing may be sent to gridgo-api
    // before a token exists, so a token that never appears is a different
    // scenario (see login-token-missing.test.tsx), not this one.
    mockGetToken.mockReset().mockResolvedValue(null);
    mockPassword.mockReset().mockImplementation(async () => {
      mockGetToken.mockResolvedValue("clerk-jwt");
      return { error: null };
    });
    mockCreate.mockReset().mockResolvedValue({ error: null });
    mockFinalize.mockReset().mockResolvedValue({ error: null });
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
    // Identifier-only: the typed address goes on `password()` itself. Opening
    // with `signIn.create()` is an extra Clerk round trip on every tap, and it
    // is only ever the recovery for a sign-in resource Clerk has already
    // staled out from under us.
    expect(mockPassword).toHaveBeenCalledWith({
      identifier: "client@gridgo.ph",
      password: "fixture-password",
    });
    expect(mockPassword).toHaveBeenCalledTimes(1);
    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockFinalize).toHaveBeenCalled();
    expect(useSession.getState().clerkSyncNonce).toBe(0);
    // Finalizing is not landing: the completed sign-in has to reach the client.
    await waitFor(() => expect(useSession.getState().user?.id).toBe("u-client"));
    expect(screen.queryByText("Could not sign in")).toBeNull();
    expect(screen.queryByText("You're already signed in.")).toBeNull();
  });
});
