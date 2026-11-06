import type { ReactElement } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import WhenScreen from "@/app/request/when";

/**
 * Today picked, the time reached, and GRIDGO cannot be asked. In its
 * own file because it presses (see AGENTS.md).
 */

const DAY = "2026-11-06";
const NEXT = "2026-11-07";
const davao = (time: string) => new Date(`${DAY}T${time}+08:00`);
const AT = davao("12:30:00").toISOString();

jest.mock("expo-router", () => ({
  useFocusEffect: () => undefined,
  useRouter: () => ({ push: jest.fn() }),
  useLocalSearchParams: () => ({ subcategory: "flyers", category: "marketing_collateral" }),
}));

jest.mock("@/lib/api", () => {
  const actual = jest.requireActual("@/lib/api");
  return { ...actual, deadlineDays: jest.fn() };
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

async function tick(ms: number) {
  await act(async () => {
    jest.advanceTimersByTime(ms);
    // The read the tick started settles on promises, not on a timer.
    for (let turn = 0; turn < 10; turn += 1) await Promise.resolve();
  });
}

const OPEN_ANSWER = {
  days: [
    { day: DAY, state: "open", status: "secured" },
    { day: NEXT, state: "open", status: "secured" },
  ],
  earliest: "2026-11-06T15:59:00+08:00",
  sameDayOrderBy: { at: AT, passed: false },
};

describe("today picked, then the read at the last order time fails", () => {
  it("takes the date back, and the other dates still work", async () => {
    jest.useFakeTimers();
    jest.setSystemTime(davao("12:29:59"));
    api.deadlineDays.mockResolvedValueOnce(OPEN_ANSWER).mockRejectedValue(new Error("offline"));

    await renderInSafeArea(<WhenScreen />);
    await tick(0);
    await act(async () => {
      fireEvent.press(screen.getByLabelText(/^6: Secured/));
    });
    expect(screen.getByText("Continue to Delivery")).toBeTruthy();

    await tick(30_000);
    expect(api.deadlineDays).toHaveBeenCalledTimes(2);
    expect(screen.getByText(/could not check which dates are possible/)).toBeTruthy();
    expect(screen.getByText("Pick a date")).toBeTruthy();
    expect(screen.queryByText("Continue to Delivery")).toBeNull();

    await act(async () => {
      fireEvent.press(screen.getByLabelText(/^7: Secured/));
    });
    expect(screen.getByText("Continue to Delivery")).toBeTruthy();
    jest.useRealTimers();
  });
});
