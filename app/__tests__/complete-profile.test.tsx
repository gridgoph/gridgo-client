import { render, screen } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import CompleteProfileScreen from "@/app/complete-profile";
import { useSession } from "@/store/session";

jest.mock("@clerk/expo", () => ({ useAuth: () => ({ isSignedIn: true }) }));

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

  it("offers the same three account types as signup, without email or password", async () => {
    await renderInSafeArea(<CompleteProfileScreen />);

    expect(screen.getByText("Finish your profile")).toBeTruthy();
    expect(screen.getByLabelText("Personal")).toBeTruthy();
    expect(screen.getByLabelText("Business")).toBeTruthy();
    expect(screen.getByLabelText("Organization")).toBeTruthy();
    expect(screen.queryByLabelText("Email")).toBeNull();
    expect(screen.queryByLabelText("Password")).toBeNull();
  });
});
