import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import PrioritiesScreen from "@/app/priorities";
import { usePriorities } from "@/store/priorities";

const mockReplace = jest.fn();
const mockBack = jest.fn();

jest.mock("expo-router", () => ({
  useRouter: () => ({ replace: mockReplace, back: mockBack, push: jest.fn() }),
  useLocalSearchParams: () => ({ returnTo: "account" }),
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
  gridgo-client#127: the button sat on "Saving…" and the new order was not
  kept. A failed save must say it is not saved and offer the retry, and the
  retry must land. Its own file, because it presses more than once (see
  AGENTS.md on this testing stack).
*/
describe("a save GRIDGO does not keep", () => {
  it("says it is not saved, offers a retry, and lands on the retry", async () => {
    const timeout = new Error("The request timed out. Try again.");
    timeout.name = "TimeoutError";
    api.savePreferences
      .mockRejectedValueOnce(timeout)
      .mockImplementationOnce(async (ranking: string[]) => ({
        ranking,
        version: 3,
        updatedAt: "2026-09-28T00:00:00.000Z",
      }));
    usePriorities.setState({ ranking: ["quality", "speed", "cost", "distance"], loaded: true });

    await renderInSafeArea(<PrioritiesScreen />);

    fireEvent.press(screen.getByLabelText("Cost"));
    await screen.findByText("So far: quality, then speed.");
    fireEvent.press(screen.getByLabelText("Distance"));
    await screen.findByText("So far: quality, then speed, then distance.");
    fireEvent.press(screen.getByLabelText("Cost"));
    await screen.findByText("GRIDGO matches on quality, then speed, then distance, and last cost.");

    fireEvent.press(screen.getByLabelText("Save this order"));

    expect(await screen.findByText("Not saved")).toBeTruthy();
    expect(screen.getByText("The request timed out. Try again.")).toBeTruthy();
    // Never left reading "Saving…", and the saved order is still the old one.
    expect(screen.queryByText("Saving…")).toBeNull();
    expect(usePriorities.getState().ranking).toEqual(["quality", "speed", "cost", "distance"]);
    expect(mockBack).not.toHaveBeenCalled();

    fireEvent.press(screen.getByLabelText("Try again"));

    expect(await screen.findByLabelText("Saved")).toBeTruthy();
    expect(screen.queryByText("Not saved")).toBeNull();
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
    expect(api.savePreferences).toHaveBeenCalledTimes(2);
    expect(api.savePreferences).toHaveBeenLastCalledWith(["quality", "speed", "distance", "cost"]);
    expect(usePriorities.getState().ranking).toEqual(["quality", "speed", "distance", "cost"]);
  });
});
