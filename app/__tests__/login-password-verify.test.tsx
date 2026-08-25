import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import LoginScreen from "@/app/(auth)/login";
import type { User } from "@/lib/api";
import { useLoginFlow } from "@/store/loginFlow";
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
const mockSendEmailCode = jest.fn();
const mockVerifyEmailCode = jest.fn();
const mockGetToken = jest.fn(
  async (_options?: { skipCache?: boolean }): Promise<string | null> => "clerk-jwt",
);
const mockSetActive = jest.fn(async () => undefined);
const mockSignOut = jest.fn(async () => undefined);

let mockSignInStatus = "needs_client_trust";
let mockSupportedSecondFactors: { strategy: string }[] = [{ strategy: "email_code" }];

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
      mfa: {
        sendEmailCode: (...args: unknown[]) => mockSendEmailCode(...args),
        verifyEmailCode: (...args: unknown[]) => mockVerifyEmailCode(...args),
        sendPhoneCode: jest.fn(),
        verifyPhoneCode: jest.fn(),
        verifyTOTP: jest.fn(),
        verifyBackupCode: jest.fn(),
      },
      get status() {
        return mockSignInStatus;
      },
      get supportedSecondFactors() {
        return mockSupportedSecondFactors;
      },
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

const mockClientEmailAvailable = jest.fn(async (..._args: unknown[]) => true);

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

const mockPreventRemove = jest.fn();
jest.mock("@react-navigation/native", () => ({
  usePreventRemove: (prevent: boolean, callback: () => void) => mockPreventRemove(prevent, callback),
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

describe("LoginScreen password verification code", () => {
  beforeEach(() => {
    mockSignInStatus = "needs_client_trust";
    mockSupportedSecondFactors = [{ strategy: "email_code" }];
    mockPassword.mockReset().mockResolvedValue({ error: null });
    mockFinalize.mockReset().mockResolvedValue({ error: null });
    mockSendEmailCode.mockReset().mockResolvedValue({ error: null });
    mockVerifyEmailCode.mockReset().mockImplementation(async () => {
      mockSignInStatus = "complete";
      return { error: null };
    });
    mockGetToken.mockReset().mockResolvedValue("clerk-jwt");
    mockSetActive.mockReset().mockResolvedValue(undefined);
    mockSignOut.mockReset().mockResolvedValue(undefined);
    mockMe.mockReset().mockResolvedValue(mappedClient);
    mockClientEmailAvailable.mockReset().mockResolvedValue(true);
    mockPreventRemove.mockClear();
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

  it("shows the Home redirect after adopt even while the code step is still armed", async () => {
    // The live bug: verify+adopt left the code step up, so usePreventRemove
    // stayed on and native navigation never left the form.
    useLoginFlow.getState().enterVerification("email_code");
    useSession.setState({
      user: mappedClient,
      source: "clerk",
      loading: false,
      error: null,
      pendingClerkProfile: false,
      justProvisioned: true,
    });

    await renderInSafeArea(<LoginScreen />);

    expect(screen.getByTestId("redirect").props.children).toBe("/(tabs)/home");
    expect(mockPreventRemove).toHaveBeenLastCalledWith(false, expect.any(Function));
    expect(screen.queryByText("Recovery code")).toBeNull();
    expect(screen.queryByText("Enter the code")).toBeNull();
  });

  it("collects the email code after password, then adopts the client home", async () => {
    useSession.setState({
      error: "This email is not available. Try a different email.",
    });
    await renderInSafeArea(<LoginScreen />);
    expect(screen.getByText("This email is not available. Try a different email.")).toBeTruthy();
    fireEvent.changeText(screen.getByLabelText("Email"), "client@gridgo.ph");
    fireEvent.changeText(screen.getByLabelText("Password"), "fixture-password");
    await waitFor(() =>
      expect(screen.getByLabelText("Password").props.value).toBe("fixture-password"),
    );

    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Sign In" }));
    });

    await waitFor(() => expect(screen.getByText("Enter the code")).toBeTruthy());
    expect(mockSendEmailCode).toHaveBeenCalled();
    expect(screen.getByLabelText("Verification code")).toBeTruthy();
    expect(screen.queryByText("This email is not available. Try a different email.")).toBeNull();
    expect(screen.queryByText("Recovery code")).toBeNull();
    expect(screen.queryByLabelText("Recovery code")).toBeNull();
    expect(screen.queryByText("Check your email")).toBeNull();
    expect(screen.queryByText("Could not sign in")).toBeNull();
    expect(screen.queryByText("Could not verify code")).toBeNull();
    expect(
      screen.queryByText("This account needs another verification step. Please try again."),
    ).toBeNull();
    expect(mockFinalize).not.toHaveBeenCalled();
    expect(mockPreventRemove).toHaveBeenLastCalledWith(true, expect.any(Function));

    fireEvent.changeText(screen.getByLabelText("Verification code"), "123456");
    await waitFor(() =>
      expect(screen.getByLabelText("Verification code").props.value).toBe("123456"),
    );
    fireEvent.press(screen.getByRole("button", { name: "Verify code" }));

    await waitFor(() => expect(useSession.getState().user?.id).toBe("u-client"));
    expect(mockVerifyEmailCode).toHaveBeenCalledWith({ code: "123456" });
    expect(mockFinalize).toHaveBeenCalled();
    expect(useSession.getState().source).toBe("clerk");
    expect(screen.getByTestId("redirect").props.children).toBe("/(tabs)/home");
    expect(mockPreventRemove).toHaveBeenLastCalledWith(false, expect.any(Function));
    expect(screen.queryByText("Could not sign in")).toBeNull();
  });
});
