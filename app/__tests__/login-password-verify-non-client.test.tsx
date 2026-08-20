import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import LoginScreen from "@/app/(auth)/login";
import type { User } from "@/lib/api";
import { useLoginFlow } from "@/store/loginFlow";
import { useSession } from "@/store/session";

const mockMe = jest.fn();
const mockPassword = jest.fn();
const mockSendEmailCode = jest.fn();
const mockClientEmailAvailable = jest.fn();
const mockGetToken = jest.fn(
  async (_options?: { skipCache?: boolean }): Promise<string | null> => null,
);
const mockSetActive = jest.fn(async () => undefined);
const mockSignOut = jest.fn(async () => undefined);

const rider: User = {
  id: "u-rider",
  email: "mddprado00290@usep.edu.ph",
  name: "Rider",
  role: "rider",
};

let mockSignInStatus = "needs_client_trust";

jest.mock("@clerk/expo", () => ({
  useSignIn: () => ({
    signIn: {
      password: (...args: unknown[]) => mockPassword(...args),
      finalize: jest.fn(),
      create: jest.fn(),
      resetPasswordEmailCode: {
        sendCode: jest.fn(),
        verifyCode: jest.fn(),
        submitPassword: jest.fn(),
      },
      mfa: {
        sendEmailCode: (...args: unknown[]) => mockSendEmailCode(...args),
        verifyEmailCode: jest.fn(),
        sendPhoneCode: jest.fn(),
        verifyPhoneCode: jest.fn(),
        verifyTOTP: jest.fn(),
        verifyBackupCode: jest.fn(),
      },
      get status() {
        return mockSignInStatus;
      },
      supportedSecondFactors: [{ strategy: "email_code" }],
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
    activateClerkClient: jest.fn(),
    clientEmailAvailable: (...args: unknown[]) => mockClientEmailAvailable(...args),
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

async function fillRiderCredentials() {
  fireEvent.changeText(screen.getByLabelText("Email"), "mddprado00290@usep.edu.ph");
  fireEvent.changeText(screen.getByLabelText("Password"), "fixture-password");
  await waitFor(() =>
    expect(screen.getByLabelText("Password").props.value).toBe("fixture-password"),
  );
}

describe("LoginScreen refuses a non-client before any verification code", () => {
  beforeEach(() => {
    mockSignInStatus = "needs_client_trust";
    mockPassword.mockReset().mockResolvedValue({ error: null });
    mockSendEmailCode.mockReset().mockResolvedValue({ error: null });
    mockGetToken.mockReset().mockResolvedValue(null);
    mockSetActive.mockReset().mockResolvedValue(undefined);
    mockSignOut.mockReset().mockResolvedValue(undefined);
    mockMe.mockReset().mockResolvedValue(rider);
    mockClientEmailAvailable.mockReset().mockResolvedValue(false);
    useLoginFlow.getState().reset();
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

  it("stays on the password form when GRIDGO already knows the email is not a client", async () => {
    await renderInSafeArea(<LoginScreen />);
    await fillRiderCredentials();

    fireEvent.press(screen.getByRole("button", { name: "Sign In" }));

    await waitFor(() =>
      expect(screen.getByText("This email is not available. Try a different email.")).toBeTruthy(),
    );
    expect(mockPassword).toHaveBeenCalled();
    expect(mockClientEmailAvailable).toHaveBeenCalledWith("mddprado00290@usep.edu.ph");
    expect(mockSendEmailCode).not.toHaveBeenCalled();
    expect(screen.queryByText("Enter the code")).toBeNull();
    expect(screen.queryByRole("button", { name: "Sign out and try again" })).toBeNull();
    expect(screen.queryByText(/could not sign you out of Clerk/i)).toBeNull();
    expect(useSession.getState().user).toBeNull();
  });
});
