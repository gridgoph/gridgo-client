import { fireEvent, render, screen } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import SettingsScreen from "@/app/settings";
import { useThemeStore } from "@/store/theme";

const mockPush = jest.fn();

jest.mock("expo-router", () => ({
  router: {
    push: (...args: unknown[]) => mockPush(...args),
  },
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

describe("SettingsScreen", () => {
  beforeEach(() => {
    mockPush.mockClear();
    useThemeStore.setState({ preference: "system", hydrated: true });
  });

  it("hosts theme chips and opens onboarding with returnTo=settings", async () => {
    await renderInSafeArea(<SettingsScreen />);

    expect(screen.getByText("Theme")).toBeTruthy();
    expect(screen.getByText("System")).toBeTruthy();
    expect(screen.getByText("Light")).toBeTruthy();
    expect(screen.getByText("Dark")).toBeTruthy();
    expect(screen.getByText("View onboarding")).toBeTruthy();

    fireEvent.press(screen.getByText("View onboarding"));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/onboarding",
      params: { returnTo: "settings" },
    });
  });
});
