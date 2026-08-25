import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import PrioritiesScreen from "@/app/priorities";
import { usePriorities } from "@/store/priorities";

const mockReplace = jest.fn();
const mockBack = jest.fn();

jest.mock("expo-router", () => ({
  useRouter: () => ({ replace: mockReplace, back: mockBack, push: jest.fn() }),
  useLocalSearchParams: () => ({ returnTo: "settings" }),
}));

jest.mock("@/lib/api", () => {
  const actual = jest.requireActual("@/lib/api");
  return { ...actual, savePreferences: jest.fn(), getPreferences: jest.fn() };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require("@/lib/api");

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

/*
  Its own file: the save writes to a store outside React, and this project's
  testing stack leaves every later render in the same file empty once that has
  happened (see AGENTS.md).
*/
describe("changing the ranking from Settings", () => {
  it("opens on the saved order and returns where it came from", async () => {
    api.savePreferences.mockImplementation(async (ranking: string[]) => ({
      ranking,
      version: 2,
      updatedAt: "2026-08-24T00:00:00.000Z",
    }));
    usePriorities.setState({ ranking: ["quality", "speed", "distance"], loaded: true });

    await renderInSafeArea(<PrioritiesScreen />);

    // The saved order is already laid out, so swapping two of them does not
    // mean retyping all three.
    expect(
      screen.getByText("GRIDGO matches on quality first, then speed, then distance."),
    ).toBeTruthy();
    expect(screen.getByLabelText("Quality").props.accessibilityValue.text).toBe("Ranked 1");

    fireEvent.press(screen.getByLabelText("Save this order"));

    await waitFor(() => expect(mockBack).toHaveBeenCalled());
    expect(api.savePreferences).toHaveBeenCalledWith(["quality", "speed", "distance"]);
    expect(usePriorities.getState().ranking).toEqual(["quality", "speed", "distance"]);
    // Never Home: a client who came from Settings is put back in Settings.
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
