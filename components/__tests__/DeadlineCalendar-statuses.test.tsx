import { render, screen } from "@testing-library/react-native";

import { DeadlineCalendar } from "@/components/DeadlineCalendar";
import type { DeadlineDay } from "@/lib/api";
import { monthGrid } from "@/lib/deadlineCalendar";

/**
 * Tight, Secured, Rush and the closed days (gridgo-api#292, report 45F0B547).
 * Built from today, because "Today, ready by" is said against the real clock.
 * No presses: the chosen day is a prop.
 */

function localKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/** A Davao instant on today's Davao date plus `plusDays`, at `hour`. */
function davao(hour: number, plusDays = 0): string {
  const day = new Date(Date.now() + 8 * 3_600_000).toISOString().slice(0, 10);
  return new Date(Date.parse(`${day}T${String(hour).padStart(2, "0")}:00:00+08:00`) + plusDays * 86_400_000).toISOString();
}

const NOW = new Date();
const MONTH = new Date(NOW.getFullYear(), NOW.getMonth(), 1);
const at = (plusDays: number) => localKey(new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() + plusDays));
const TODAY = at(0);
const TOMORROW = at(1);

const AVAILABILITY: DeadlineDay[] = [
  { day: TODAY, state: "tight", status: "tight", reason: null, readyBy: davao(15), rushTier: null },
  { day: TOMORROW, state: "open", status: "secured", reason: null, readyBy: davao(11, 1), rushTier: null },
  {
    day: at(2),
    state: "tight",
    status: "rush",
    reason: null,
    readyBy: davao(13, 2),
    rushTier: { id: "t", label: "Same day", turnaroundHours: 4, priceMinor: 1, surchargeMinor: null },
  },
  { day: at(3), state: "cannot", status: "not_possible", reason: "gridgo_closed_sunday", readyBy: null, rushTier: null },
];

const daysFor = (month: Date) => monthGrid({ month, availability: AVAILABILITY, now: NOW });

function renderCalendar(selectedDayKey: string | null, availability = AVAILABILITY) {
  return render(
    <DeadlineCalendar
      daysFor={availability === AVAILABILITY ? daysFor : (month) => monthGrid({ month, availability, now: NOW })}
      month={MONTH}
      selectedDayKey={selectedDayKey}
      onSelectDay={jest.fn()}
      onStepMonth={jest.fn()}
      canStepBack={false}
      canStepForward={false}
      earliest={davao(15)}
      cutoffMinute={960}
    />,
  );
}

const dayNumber = (key: string) => Number(key.slice(8));
// Days near the end of a month fall on the next page; only this month's are labelled here.
const inThisMonth = (key: string) => key.slice(0, 7) === localKey(MONTH).slice(0, 7);

it("labels every status, with each day's ready time", async () => {
  await renderCalendar(null);

  expect(screen.getByLabelText(`${dayNumber(TODAY)}: Tight: the shop may decline. Today, ready by 3:00 PM`)).toBeTruthy();
  if (inThisMonth(TOMORROW)) {
    expect(screen.getByLabelText(`${dayNumber(TOMORROW)}: Secured. Tomorrow, ready by 11:00 AM`)).toBeTruthy();
  }
  if (inThisMonth(at(2))) {
    expect(screen.getByLabelText(new RegExp(`^${dayNumber(at(2))}: Rush, costs more\\. Ready by `))).toBeTruthy();
  }
  if (inThisMonth(at(3))) {
    expect(screen.getByLabelText(`${dayNumber(at(3))}: Not possible. GRIDGO is closed on Sundays`)).toBeTruthy();
  }
});

it("keys the month in words, and explains the bolt only where one is drawn", async () => {
  await renderCalendar(null);
  expect(screen.getByText("Secured")).toBeTruthy();
  expect(screen.getByText("Tight: the shop may decline")).toBeTruthy();
  expect(screen.getByText("Not possible: tap to see why")).toBeTruthy();
  expect(screen.queryAllByText("Rush, costs more").length).toBe(inThisMonth(at(2)) ? 1 : 0);
});

it("says a chosen Tight today's ready time under the month", async () => {
  await renderCalendar(TODAY);
  expect(screen.getByTestId("day-ready")).toBeTruthy();
  expect(screen.getByText("Today, ready by 3:00 PM")).toBeTruthy();
  expect(screen.getByText("Tight: quicker than the shop's usual time, so the shop may decline.")).toBeTruthy();
});

it("names the cutoff when today is too late", async () => {
  const late: DeadlineDay[] = [
    { day: TODAY, state: "cannot", status: "not_possible", reason: "after_dispatch_cutoff", readyBy: null, rushTier: null },
  ];
  await renderCalendar(null, late);
  expect(
    screen.getByLabelText(`${dayNumber(TODAY)}: Not possible. Too late for today: the 4:00 PM cutoff has passed`),
  ).toBeTruthy();
});

it("reads an older answer without the new fields", async () => {
  const older: DeadlineDay[] = [{ day: TODAY, state: "open" }];
  await renderCalendar(TODAY, older);
  expect(screen.getByLabelText(`${dayNumber(TODAY)}: Secured`)).toBeTruthy();
  // No ready time was sent, so none is said: the chosen day is named instead.
  expect(screen.getByText("Secured: the shop's usual time makes this date.")).toBeTruthy();
  expect(screen.queryByText(/ready by/)).toBeNull();
});
