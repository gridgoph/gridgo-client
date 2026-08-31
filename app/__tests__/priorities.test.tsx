import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import PrioritiesScreen from "@/app/priorities";
import { usePriorities } from "@/store/priorities";

const mockReplace = jest.fn();
const mockBack = jest.fn();
let mockParams: Record<string, string> = {};

jest.mock("expo-router", () => ({
  useRouter: () => ({ replace: mockReplace, back: mockBack, push: jest.fn() }),
  useLocalSearchParams: () => mockParams,
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

/** What a priority's card is announcing right now. */
function rankOf(label: string): string {
  return screen.getByLabelText(label).props.accessibilityValue.text;
}

beforeEach(() => {
  mockReplace.mockClear();
  mockBack.mockClear();
  mockParams = {};
  api.savePreferences.mockImplementation(async (ranking: string[]) => ({
    ranking,
    version: 1,
    updatedAt: "2026-08-24T00:00:00.000Z",
  }));
  usePriorities.setState({ ranking: null, loaded: true });
});

describe("PrioritiesScreen", () => {
  it("opens with nothing ranked, so GRIDGO is not deciding for the client", async () => {
    await renderInSafeArea(<PrioritiesScreen />);

    expect(screen.getByText("Nothing ranked yet.")).toBeTruthy();
    for (const label of ["Quality", "Speed", "Distance"]) {
      expect(rankOf(label)).toBe("Not ranked");
    }
  });

  it("stamps a number on each priority as it is tapped", async () => {
    await renderInSafeArea(<PrioritiesScreen />);

    fireEvent.press(screen.getByLabelText("Speed"));
    expect(await screen.findByText("So far: speed.")).toBeTruthy();
    expect(rankOf("Speed")).toBe("Ranked 1");

    fireEvent.press(screen.getByLabelText("Distance"));
    expect(await screen.findByText("So far: speed, then distance.")).toBeTruthy();

    fireEvent.press(screen.getByLabelText("Cost"));
    expect(await screen.findByText("So far: speed, then distance, then cost.")).toBeTruthy();

    fireEvent.press(screen.getByLabelText("Quality"));
    expect(
      await screen.findByText("GRIDGO matches on speed, then distance, then cost, and last quality."),
    ).toBeTruthy();
    expect(rankOf("Quality")).toBe("Ranked 4");
  });

  it("takes a correction back to the step being corrected", async () => {
    await renderInSafeArea(<PrioritiesScreen />);

    fireEvent.press(screen.getByLabelText("Speed"));
    await screen.findByText("So far: speed.");
    fireEvent.press(screen.getByLabelText("Distance"));
    await screen.findByText("So far: speed, then distance.");
    fireEvent.press(screen.getByLabelText("Cost"));
    await screen.findByText("So far: speed, then distance, then cost.");
    fireEvent.press(screen.getByLabelText("Quality"));
    await screen.findByText("GRIDGO matches on speed, then distance, then cost, and last quality.");

    // Second place is being reconsidered, so third has not been decided yet.
    fireEvent.press(screen.getByLabelText("Distance"));
    expect(await screen.findByText("So far: speed.")).toBeTruthy();

    expect(rankOf("Speed")).toBe("Ranked 1");
    expect(rankOf("Distance")).toBe("Not ranked");
    expect(rankOf("Quality")).toBe("Not ranked");
  });

  it("will not save a half-made ranking", async () => {
    await renderInSafeArea(<PrioritiesScreen />);

    fireEvent.press(screen.getByLabelText("Speed"));
    await screen.findByText("So far: speed.");
    fireEvent.press(screen.getByLabelText("Save and continue"));

    expect(usePriorities.getState().ranking).toBeNull();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("says nothing about internal codes", async () => {
    await renderInSafeArea(<PrioritiesScreen />);

    for (const code of ["quality", "speed", "cost", "distance"]) {
      expect(screen.queryByText(code)).toBeNull();
    }
  });
});

/*
  Saving writes to a store outside React, which this project's testing stack
  does not survive twice in one file (see AGENTS.md). So the saving cases go
  last, and the Settings round trip has a file of its own.
*/
describe("saving", () => {
  it("saves the finished order and sends a new client on to Home", async () => {
    await renderInSafeArea(<PrioritiesScreen />);

    fireEvent.press(screen.getByLabelText("Distance"));
    await screen.findByText("So far: distance.");
    fireEvent.press(screen.getByLabelText("Quality"));
    await screen.findByText("So far: distance, then quality.");
    fireEvent.press(screen.getByLabelText("Speed"));
    await screen.findByText("So far: distance, then quality, then speed.");
    fireEvent.press(screen.getByLabelText("Cost"));
    await screen.findByText("GRIDGO matches on distance, then quality, then speed, and last cost.");

    fireEvent.press(screen.getByLabelText("Save and continue"));

    // Saving goes to GRIDGO, so the ranking lands a round trip later.
    await waitFor(() =>
      expect(usePriorities.getState().ranking).toEqual(["distance", "quality", "speed", "cost"]),
    );
    expect(api.savePreferences).toHaveBeenCalledWith(["distance", "quality", "speed", "cost"]);
    expect(mockReplace).toHaveBeenCalledWith("/(tabs)/home");
  });
});
