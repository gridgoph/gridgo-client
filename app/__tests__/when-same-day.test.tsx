import type { ReactElement } from "react";
import { act, render, screen } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import WhenScreen from "@/app/request/when";

/**
 * Today's last order time on the date screen, and the clock crossing it.
 *
 * The clock is fake and fixed in Davao, so "today" and 12:30 are the same in
 * every run. The API's own boundary (12:29:59.999 / 12:30:00) is pinned in
 * gridgo-api; here the screen has to follow what the answer says.
 */

const DAY = "2026-11-06";
const NEXT = "2026-11-07";
const davao = (time: string) => new Date(`${DAY}T${time}+08:00`);
const AT = davao("12:30:00").toISOString();
const ORDER_BEFORE = "Order before 12:30 PM to get it today.";
const CLOSED = "Same-day orders closed at 12:30 PM today.";

const TODAY_OPEN = [
  { day: DAY, state: "open", status: "secured" },
  { day: NEXT, state: "open", status: "secured" },
];
const TODAY_GONE = [
  { day: DAY, state: "cannot", status: "not_possible", reason: "before_shortest_time" },
  { day: NEXT, state: "open", status: "secured" },
];
const earliest = "2026-11-06T15:59:00+08:00";

jest.mock("expo-router", () => ({
  useFocusEffect: () => undefined,
  useRouter: () => ({ push: jest.fn() }),
  useLocalSearchParams: () => ({ subcategory: "blueprint_cad_plotting", category: "specialized_prototyping" }),
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

/** Open the screen at this Davao time, with the first answer settled. */
async function openAt(time: string) {
  jest.setSystemTime(davao(time));
  await renderInSafeArea(<WhenScreen />);
  await tick(0);
}

async function tick(ms: number) {
  await act(async () => {
    jest.advanceTimersByTime(ms);
    // The read the tick started settles on promises, not on a timer.
    for (let turn = 0; turn < 10; turn += 1) await Promise.resolve();
  });
}

describe("today's last order time on the date screen", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    api.deadlineDays.mockReset();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it("says the time at 12:29 while today can be picked, beside the earliest line", async () => {
    api.deadlineDays.mockResolvedValue({ days: TODAY_OPEN, earliest, sameDayOrderBy: { at: AT, passed: false } });
    await openAt("12:29:00");
    expect(screen.getByText(ORDER_BEFORE)).toBeTruthy();
    expect(screen.getByText(/^Earliest ready: Fri 6 Nov/)).toBeTruthy();
  });

  it("says today has closed at 12:30, beside the earliest line", async () => {
    api.deadlineDays.mockResolvedValue({
      days: TODAY_GONE,
      earliest: "2026-11-07T08:00:00+08:00",
      sameDayOrderBy: { at: AT, passed: true },
    });
    await openAt("12:30:00");
    expect(screen.getByText(CLOSED)).toBeTruthy();
    expect(screen.queryByText(ORDER_BEFORE)).toBeNull();
    expect(screen.getByText(/^Earliest ready: Sat 7 Nov/)).toBeTruthy();
  });

  it("offers no time before GRIDGO opens", async () => {
    api.deadlineDays.mockResolvedValue({ days: TODAY_GONE, earliest, sameDayOrderBy: { at: AT, passed: false } });
    await openAt("07:30:00");
    expect(screen.queryByText(ORDER_BEFORE)).toBeNull();
    expect(screen.queryByText(CLOSED)).toBeNull();
  });

  it.each([
    ["null", { sameDayOrderBy: null }],
    ["missing, on an older API", {}],
  ])("shows no message when the field is %s", async (_name, field) => {
    api.deadlineDays.mockResolvedValue({ days: TODAY_OPEN, earliest, ...field });
    await openAt("12:29:00");
    expect(screen.queryByText(/Order before|Same-day orders/)).toBeNull();
    expect(screen.getByText(/^Earliest ready/)).toBeTruthy();
  });

  it("asks GRIDGO once as the clock crosses, and the dates and the line change together", async () => {
    api.deadlineDays
      .mockResolvedValueOnce({ days: TODAY_OPEN, earliest, sameDayOrderBy: { at: AT, passed: false } })
      .mockResolvedValue({
        days: TODAY_GONE,
        earliest: "2026-11-07T08:00:00+08:00",
        sameDayOrderBy: { at: AT, passed: true },
      });
    await openAt("12:29:58");
    expect(screen.getByText(ORDER_BEFORE)).toBeTruthy();
    expect(api.deadlineDays).toHaveBeenCalledTimes(1);

    await tick(1_000);
    expect(api.deadlineDays).toHaveBeenCalledTimes(1);

    await tick(1_000);
    expect(api.deadlineDays).toHaveBeenCalledTimes(2);
    expect(screen.getByText(CLOSED)).toBeTruthy();
    expect(screen.queryByText(ORDER_BEFORE)).toBeNull();
    expect(screen.getByText(/^Earliest ready: Sat 7 Nov/)).toBeTruthy();
    expect(screen.getByLabelText(/^6: Not possible\. Before the shop's shortest time/)).toBeTruthy();

    // And it stays at two: nothing left to cross.
    await tick(10_000);
    expect(api.deadlineDays).toHaveBeenCalledTimes(2);
  });

  it("does not loop when GRIDGO still says the time is ahead of its own clock", async () => {
    // A phone running fast crosses first. The same answer comes back and the
    // screen must not keep asking; it stays quiet rather than naming a past time.
    api.deadlineDays.mockResolvedValue({ days: TODAY_OPEN, earliest, sameDayOrderBy: { at: AT, passed: false } });
    await openAt("12:29:59");
    await tick(30_000);
    expect(api.deadlineDays).toHaveBeenCalledTimes(2);
    expect(screen.queryByText(ORDER_BEFORE)).toBeNull();
    expect(screen.queryByText(CLOSED)).toBeNull();
  });

  it("says GRIDGO could not check when the read after the crossing fails, once", async () => {
    api.deadlineDays
      .mockResolvedValueOnce({ days: TODAY_OPEN, earliest, sameDayOrderBy: { at: AT, passed: false } })
      .mockRejectedValue(new Error("offline"));
    await openAt("12:29:59");
    await tick(30_000);
    expect(api.deadlineDays).toHaveBeenCalledTimes(2);
    expect(screen.queryByText(ORDER_BEFORE)).toBeNull();
    expect(screen.getByText(/could not check which dates are possible/)).toBeTruthy();
  });

  it("keeps CAD in capitals in the question", async () => {
    jest.spyOn(api, "productCategoriesNow").mockReturnValue([
      {
        code: "specialized_prototyping",
        name: "Specialized",
        subcategories: [{ code: "blueprint_cad_plotting", name: "Blueprint & CAD Plotting" }],
      },
    ]);
    api.deadlineDays.mockResolvedValue({ days: TODAY_OPEN, earliest });
    await openAt("12:29:00");
    expect(screen.getByText("When do you need your blueprint & CAD plotting?")).toBeTruthy();
  });
});
