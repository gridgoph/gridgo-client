import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import SignupScreen from "@/app/(auth)/signup";
import type { User } from "@/lib/api";
import { useSession } from "@/store/session";
import { useSignupFlow } from "@/store/signupFlow";

/**
 * Sign-up's whole point: Clerk finishing is not the end. Unless the completed
 * sign-up is adopted into the GRIDGO client projection, `useSession().user`
 * stays null and the person sits on the form watching nothing happen.
 */

const mockMe = jest.fn();
const client: User = {
  id: "u-client",
  email: "ana@company.com",
  name: "Ana Santos",
  role: "client",
  accountType: "individual",
};

const mockPassword = jest.fn();
const mockFinalize = jest.fn();
const mockSendEmailCode = jest.fn();
const mockVerifyEmailCode = jest.fn();
const mockGetToken = jest.fn(async (_options?: { skipCache?: boolean }) => "clerk-jwt");
const mockSetActive = jest.fn(async () => undefined);
const mockSignOut = jest.fn(async () => undefined);

const signUpState = {
  status: "missing_requirements" as string,
  unverifiedFields: ["email_address"] as string[],
  missingFields: [] as string[],
  existingSession: null as { sessionId: string } | null,
};

jest.mock("@clerk/expo", () => ({
  useSignUp: () => ({
    signUp: {
      password: (...args: unknown[]) => mockPassword(...args),
      finalize: (...args: unknown[]) => mockFinalize(...args),
      verifications: {
        sendEmailCode: (...args: unknown[]) => mockSendEmailCode(...args),
        verifyEmailCode: (...args: unknown[]) => mockVerifyEmailCode(...args),
      },
      get status() {
        return signUpState.status;
      },
      get unverifiedFields() {
        return signUpState.unverifiedFields;
      },
      get missingFields() {
        return signUpState.missingFields;
      },
      get existingSession() {
        return signUpState.existingSession;
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

jest.mock("@/lib/api", () => {
  const actual = jest.requireActual("@/lib/api");
  return {
    ...actual,
    me: (...args: unknown[]) => mockMe(...args),
    activateClerkClient: jest.fn(),
    setTokenProvider: jest.fn(),
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

describe("SignupScreen finalize", () => {
  beforeEach(() => {
    signUpState.status = "missing_requirements";
    signUpState.unverifiedFields = ["email_address"];
    signUpState.missingFields = [];
    signUpState.existingSession = null;
    mockPassword.mockReset().mockResolvedValue({ error: null });
    mockFinalize.mockReset().mockResolvedValue({ error: null });
    mockSendEmailCode.mockReset().mockResolvedValue({ error: null });
    mockVerifyEmailCode.mockReset().mockImplementation(async () => {
      signUpState.status = "complete";
      signUpState.unverifiedFields = [];
      return { error: null };
    });
    mockGetToken.mockReset().mockResolvedValue("clerk-jwt");
    mockSetActive.mockReset().mockResolvedValue(undefined);
    mockSignOut.mockReset().mockResolvedValue(undefined);
    mockMe.mockReset().mockResolvedValue(client);
    useSession.setState({
      user: null,
      source: null,
      loading: false,
      error: null,
      pendingClerkProfile: false,
      justProvisioned: false,
      clerkSyncNonce: 0,
    });
    useSignupFlow.getState().reset();
  });

  it("verifies the emailed code, adopts the client, and lands home", async () => {
    await renderInSafeArea(<SignupScreen />);
    fireEvent.changeText(screen.getByLabelText("Full name"), "Ana Santos");
    fireEvent.changeText(screen.getByLabelText("Email"), "ana@company.com");
    fireEvent.changeText(screen.getByLabelText("Password"), "a-long-gridgo-password");
    fireEvent.changeText(screen.getByLabelText("Confirm password"), "a-long-gridgo-password");
    await waitFor(() =>
      expect(screen.getByLabelText("Confirm password").props.value).toBe(
        "a-long-gridgo-password",
      ),
    );

    fireEvent.press(screen.getByRole("button", { name: "Sign Up" }));

    await waitFor(() => expect(screen.getByText("Verify your email")).toBeTruthy());
    expect(mockSendEmailCode).toHaveBeenCalled();
    expect(mockFinalize).not.toHaveBeenCalled();

    fireEvent.changeText(screen.getByLabelText("Verification code"), "123456");
    await waitFor(() =>
      expect(screen.getByLabelText("Verification code").props.value).toBe("123456"),
    );
    fireEvent.press(screen.getByRole("button", { name: "Verify email" }));

    await waitFor(() => expect(useSession.getState().user?.id).toBe("u-client"));
    expect(mockVerifyEmailCode).toHaveBeenCalledWith({ code: "123456" });
    expect(mockFinalize).toHaveBeenCalled();
    expect(useSession.getState().source).toBe("clerk");
    expect(screen.getByTestId("redirect").props.children).toBe("/(tabs)/home");
    expect(screen.queryByText("Could not create account")).toBeNull();
  });
});
