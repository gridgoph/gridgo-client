import type { ReactElement } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import WhenScreen from "@/app/request/when";
import { useJobDeadline } from "@/store/jobDeadline";

/**
 * Picking a day, in its own file.
 *
 * Separate from the rest of the screen's tests because it presses, and this
 * combination of testing-library and React 19 empties a file's later renders
 * after two presses — the limit AGENTS.md documents.
 */

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

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush }),
  useLocalSearchParams: () => ({ subcategory: "flyers", category: "marketing_collateral" }),
}));

/** Every day of the next four months bookable, which is the ordinary case. */
function openDays(count = 120) {
  const out = [];
  const cursor = new Date();
  for (let index = 0; index < count; index += 1) {
    const year = cursor.getFullYear();
    const month = String(cursor.getMonth() + 1).padStart(2, "0");
    const day = String(cursor.getDate()).padStart(2, "0");
    out.push({ day: `${year}-${month}-${day}`, state: "open" as const });
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

jest.mock("@/lib/api", () => {
  const actual = jest.requireActual("@/lib/api");
  return { ...actual, deadlineDays: jest.fn() };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require("@/lib/api");

describe("choosing a day", () => {
  beforeEach(() => {
    mockPush.mockReset();
    useJobDeadline.getState().clear();
    api.deadlineDays.mockResolvedValue({ days: openDays(), earliest: new Date().toISOString() });
  });

  it("takes the tap and puts the date on the control that finishes the screen", async () => {
    // The captain could not select at all. A day GRIDGO said it could make has
    // to be pressable, and pressing it has to be visible somewhere — the
    // button is where, because a ring on one disc among forty-two is not a
    // confirmation anybody reads.
    await renderInSafeArea(<WhenScreen />);

    // Whichever day the month opens on, the first one GRIDGO said it could
    // make. Naming a date here would tie the test to the day it is run.
    await waitFor(() =>
      expect(screen.getAllByLabelText(/: We can make this$/).length).toBeGreaterThan(0),
    );
    fireEvent.press(screen.getAllByLabelText(/: We can make this$/)[0]);

    await waitFor(() => expect(screen.getByText("Continue")).toBeTruthy());
    expect(screen.queryByText("Pick a date")).toBeNull();
  });
});
