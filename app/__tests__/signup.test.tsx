import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import SignupScreen from "@/app/(auth)/signup";
import { useSession } from "@/store/session";
import { useSignupFlow } from "@/store/signupFlow";

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

describe("SignupScreen", () => {
  beforeEach(() => {
    useSignupFlow.getState().reset();
    useSession.setState({
      user: null,
      loading: false,
      error: null,
      source: null,
      pendingClerkProfile: false,
      justProvisioned: false,
    });
    mockSignUp.status = "missing_requirements";
    mockSignUp.unverifiedFields = ["email_address"];
    mockSignUp.missingFields = [];
    mockSignUp.existingSession = null;
    mockSignUp.password.mockReset().mockResolvedValue({ error: null });
    mockSignUp.finalize.mockReset().mockResolvedValue({ error: null });
    mockSignUp.verifications.sendEmailCode.mockReset().mockResolvedValue({ error: null });
    mockSignUp.verifications.verifyEmailCode.mockReset().mockResolvedValue({ error: null });
  });

  it("shows the approved four-field client form", async () => {
    await renderInSafeArea(<SignupScreen />);

    expect(screen.getByText("Create Account")).toBeTruthy();
    expect(screen.getByLabelText("Full name")).toBeTruthy();
    expect(screen.getByLabelText("Email")).toBeTruthy();
    expect(screen.getByLabelText("Password")).toBeTruthy();
    expect(screen.getByLabelText("Confirm password")).toBeTruthy();
    expect(screen.queryByText(/^Supplier$/)).toBeNull();
    expect(screen.queryByText(/^Rider$/)).toBeNull();
  });

  it("starts email verification after Clerk accepts the account", async () => {
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

    await waitFor(() => expect(mockSignUp.password).toHaveBeenCalled());
    expect(mockSignUp.password).toHaveBeenCalledWith({
      emailAddress: "ana@company.com",
      password: "a-long-gridgo-password",
      firstName: "Ana",
      lastName: "Santos",
    });
    expect(mockSignUp.verifications.sendEmailCode).toHaveBeenCalled();
  });
});
