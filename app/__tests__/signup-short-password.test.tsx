import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import SignupScreen from "@/app/(auth)/signup";
import { useSession } from "@/store/session";
import { useSignupFlow } from "@/store/signupFlow";
import { holdLegalLibrary } from "@/test/legalGate";

const mockSignUp = {
  status: "missing_requirements",
  unverifiedFields: ["email_address"],
  missingFields: [] as string[],
  existingSession: null as { sessionId: string } | null,
  password: jest.fn(),
  finalize: jest.fn(),
  verifications: {
    sendEmailCode: jest.fn(),
    verifyEmailCode: jest.fn(),
  },
};

jest.mock("@clerk/expo", () => ({
  useSignUp: () => ({ signUp: mockSignUp, fetchStatus: "idle" }),
  useAuth: () => ({
    isSignedIn: false,
    isLoaded: true,
    getToken: jest.fn(async () => "clerk-jwt"),
    sessionId: null,
  }),
  useClerk: () => ({
    setActive: jest.fn(async () => undefined),
    signOut: jest.fn(async () => undefined),
  }),
}));

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

/**
 * Clerk's minimum is 15 characters. The app used to pass anything from 8, so
 * Clerk refused the password only after the form was filled in
 * (gridgo-supplier#215). One press per test (see AGENTS.md).
 */
describe("SignupScreen password rule", () => {
  beforeEach(() => {
    useSignupFlow.getState().reset();
    useSignupFlow.getState().setConsent({ agreed: true, adult: true, guardian: false, marketing: false });
    holdLegalLibrary();
    useSession.setState({
      user: null,
      loading: false,
      error: null,
      source: null,
      pendingClerkProfile: false,
      justProvisioned: false,
    });
    mockSignUp.password.mockReset().mockResolvedValue({ error: null });
  });

  it("states 15 characters and stops a shorter password on its field, before Clerk", async () => {
    await renderInSafeArea(<SignupScreen />);
    expect(screen.getByText("At least 15 characters.")).toBeTruthy();

    fireEvent.changeText(screen.getByLabelText("Full name"), "Ana Santos");
    fireEvent.changeText(screen.getByLabelText("Email"), "ana@company.com");
    fireEvent.changeText(screen.getByLabelText("Password"), "gridgo-pw-14ch");
    fireEvent.changeText(screen.getByLabelText("Confirm password"), "gridgo-pw-14ch");
    await waitFor(() =>
      expect(screen.getByLabelText("Confirm password").props.value).toBe("gridgo-pw-14ch"),
    );

    fireEvent.press(screen.getByRole("button", { name: "Sign Up" }));

    expect(await screen.findByText("Use at least 15 characters.")).toBeTruthy();
    expect(screen.queryByText("At least 15 characters.")).toBeNull();
    expect(mockSignUp.password).not.toHaveBeenCalled();
  });
});
