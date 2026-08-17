import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import SignupScreen from "@/app/(auth)/signup";
import type { User } from "@/lib/api";
import { useSession } from "@/store/session";
import { useSignupFlow } from "@/store/signupFlow";

/**
 * Signing up on a phone Clerk still holds a session for. Clerk refuses to
 * create a second one, and "you are currently logged in" is not a failure —
 * the leftover is adopted and the person lands home.
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
const mockGetToken = jest.fn(async (_options?: { skipCache?: boolean }) => "clerk-jwt");
const mockSetActive = jest.fn(async () => undefined);
const mockSignOut = jest.fn(async () => undefined);

jest.mock("@clerk/expo", () => ({
  useSignUp: () => ({
    signUp: {
      password: (...args: unknown[]) => mockPassword(...args),
      finalize: (...args: unknown[]) => mockFinalize(...args),
      verifications: {
        sendEmailCode: (...args: unknown[]) => mockSendEmailCode(...args),
        verifyEmailCode: jest.fn(),
      },
      status: "missing_requirements",
      unverifiedFields: ["email_address"],
      missingFields: [],
      existingSession: null,
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

describe("SignupScreen with a leftover Clerk session", () => {
  beforeEach(() => {
    mockPassword.mockReset().mockResolvedValue({ error: null });
    mockFinalize.mockReset().mockResolvedValue({ error: null });
    mockSendEmailCode.mockReset().mockResolvedValue({ error: null });
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

  it("adopts the leftover session and lands home instead of failing", async () => {
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

    await waitFor(() => expect(useSession.getState().user?.id).toBe("u-client"));
    expect(mockSetActive).toHaveBeenCalledWith({ session: "sess_leftover" });
    // The leftover was usable, so no new sign-up was started and nothing was
    // signed out from under the person.
    expect(mockPassword).not.toHaveBeenCalled();
    expect(mockSignOut).not.toHaveBeenCalled();
    expect(screen.getByTestId("redirect").props.children).toBe("/(tabs)/home");
    expect(screen.queryByText("Could not create account")).toBeNull();
  });
});
