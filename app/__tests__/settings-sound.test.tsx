import { fireEvent, render, screen } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import SettingsScreen from "@/app/settings";
import { useNotificationNudge } from "@/store/notificationNudge";
import { useThemeStore } from "@/store/theme";

const mockPreview = jest.fn();

jest.mock("expo-router", () => ({ router: { push: jest.fn() } }));
jest.mock("@/lib/updateChime", () => ({
  previewUpdateChime: () => mockPreview(),
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

/** Settings > App sounds: the chime (#230) and the receipt print (#229). One press per test — see AGENTS.md. */
describe("Settings app sounds", () => {
  beforeEach(() => {
    mockPreview.mockClear();
    useThemeStore.setState({ preference: "system", hydrated: true });
  });

  it("is on by default and mutes from the row, without a preview", async () => {
    useNotificationNudge.setState({ muted: false });
    await renderInSafeArea(<SettingsScreen />);

    const row = screen.getByRole("switch", { name: "App sounds" });
    expect(row.props.accessibilityState).toEqual({ checked: true });
    expect(screen.getByText(/silent mode still mutes them/)).toBeTruthy();

    fireEvent.press(row);
    expect(useNotificationNudge.getState().muted).toBe(true);
    expect(mockPreview).not.toHaveBeenCalled();
  });

  it("plays the chime once when the sound is switched back on", async () => {
    useNotificationNudge.setState({ muted: true });
    await renderInSafeArea(<SettingsScreen />);

    fireEvent.press(screen.getByRole("switch", { name: "App sounds" }));
    expect(useNotificationNudge.getState().muted).toBe(false);
    expect(mockPreview).toHaveBeenCalledTimes(1);
  });
});
