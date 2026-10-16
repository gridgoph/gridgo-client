import { render, screen } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import CompleteProfileScreen from "@/app/complete-profile";
import { useSession } from "@/store/session";
import { holdLegalLibrary } from "@/test/legalGate";

jest.mock("@clerk/expo", () => ({
  useAuth: () => ({
    isSignedIn: true,
    isLoaded: true,
    getToken: jest.fn(async () => "clerk-jwt"),
    sessionId: null,
  }),
  useUser: () => ({
    isLoaded: true,
    user: { primaryEmailAddress: { emailAddress: "ana@example.com" } },
  }),
  useClerk: () => ({
    setActive: jest.fn(async () => undefined),
    signOut: jest.fn(async () => undefined),
  }),
}));

jest.mock("expo-router", () => ({
  Redirect: () => null,
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

describe("CompleteProfileScreen", () => {
  beforeEach(() => {
    useSession.setState({
      user: null,
      loading: false,
      error: null,
      source: null,
      pendingClerkProfile: true,
      justProvisioned: false,
    });
  });

  it("asks a Google sign-up to agree before GRIDGO creates the account", async () => {
    holdLegalLibrary();
    await renderInSafeArea(<CompleteProfileScreen />);

    expect(screen.getByText("Finish signing up")).toBeTruthy();
    expect(screen.getByLabelText("Read the Terms of Service")).toBeTruthy();
    expect(screen.getByLabelText("Read the Privacy Notice")).toBeTruthy();
    const agree = screen.getByRole("checkbox", {
      name: "I agree to the Terms of Service and Privacy Notice",
    });
    expect(agree.props.accessibilityState.checked).toBe(false);
    expect(
      screen.getByRole("checkbox", { name: "Send me GRIDGO news and offers" }).props
        .accessibilityState.checked,
    ).toBe(false);
    expect(
      screen.getByRole("button", { name: "Create my account" }).props.accessibilityState.disabled,
    ).toBe(true);
    expect(screen.getByRole("button", { name: "Sign out" })).toBeTruthy();
  });

  it("offers the same three account types as signup, without email or password", async () => {
    // Enrolled already, but GRIDGO cannot read the account type.
    useSession.setState({
      user: { id: "u1", email: "ana@example.com", name: "Ana", role: "client" },
      pendingClerkProfile: false,
    });
    await renderInSafeArea(<CompleteProfileScreen />);

    expect(screen.getByText("Finish your profile")).toBeTruthy();
    expect(screen.getByLabelText("Personal")).toBeTruthy();
    expect(screen.getByLabelText("Business")).toBeTruthy();
    expect(screen.getByLabelText("Organization")).toBeTruthy();
    expect(screen.queryByLabelText("Email")).toBeNull();
    expect(screen.queryByLabelText("Password")).toBeNull();
  });
});
