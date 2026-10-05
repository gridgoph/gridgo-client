import { fireEvent, render, screen } from "@testing-library/react-native";

import { DeadlineCalendar } from "@/components/DeadlineCalendar";
import type { DeadlineDay } from "@/lib/api";
import { monthGrid } from "@/lib/deadlineCalendar";
import type { SeasonWindow } from "@/lib/seasonWindows";

const MARCH = new Date(2026, 2, 1);
const NOW = new Date(2026, 2, 1, 9, 0, 0);

const graduation: SeasonWindow = {
  id: "sea_grad",
  name: "Graduation",
  startDate: "2026-03-12",
  endDate: "2026-03-18",
  demandLevel: "Peak",
  message: "Shops fill up fast. Order two weeks ahead.",
  banner: { startDate: "2026-01-29", endDate: "2026-02-12" },
};

/** Every March day open except the 16th, which nobody can make. */
function marchAvailability(): DeadlineDay[] {
  return Array.from({ length: 31 }, (_, index) => {
    const day = `2026-03-${String(index + 1).padStart(2, "0")}`;
    return { day, state: day === "2026-03-16" ? "cannot" : "open" };
  });
}

const daysFor = (month: Date) =>
  monthGrid({ month, availability: marchAvailability(), now: NOW, seasons: [graduation] });

function renderCalendar(selectedDayKey: string | null, onSelectDay = jest.fn()) {
  return render(
    <DeadlineCalendar
      daysFor={daysFor}
      month={MARCH}
      selectedDayKey={selectedDayKey}
      onSelectDay={onSelectDay}
      onStepMonth={jest.fn()}
      canStepBack={false}
      canStepForward={false}
      seasons={[graduation]}
    />,
  );
}

it("names the month's season with its level and dates, and says it blocks nothing", async () => {
  await renderCalendar(null);

  expect(screen.getByText("Graduation")).toBeTruthy();
  expect(screen.getByText("Peak")).toBeTruthy();
  expect(screen.getByText("12–18 Mar")).toBeTruthy();
  expect(screen.getByText(/Every open date can still be booked/)).toBeTruthy();
  // The message waits until a day inside the season is picked or tapped.
  expect(screen.queryByText(graduation.message)).toBeNull();
});

it("says a season day's season aloud, and keeps it pickable", async () => {
  await renderCalendar(null);

  const day = screen.getByLabelText("13: We can make this. Peak season, Graduation");
  expect(day.props.accessibilityState).toMatchObject({ disabled: false });
  expect(screen.getByLabelText("11: We can make this")).toBeTruthy();
});

it("opens the season's message when the chosen day is inside it", async () => {
  await renderCalendar("2026-03-14");

  expect(screen.getByText(graduation.message)).toBeTruthy();
});

it("keeps the message closed for a day outside every season", async () => {
  await renderCalendar("2026-03-20");

  expect(screen.queryByText(graduation.message)).toBeNull();
});

// Presses, so it goes last in the file (see AGENTS.md on testing-library and React 19).
it("shows the message for a tapped season day nobody can make, without choosing it", async () => {
  const onSelectDay = jest.fn();
  await renderCalendar(null, onSelectDay);

  fireEvent.press(screen.getByLabelText("16: Not this day. Peak season, Graduation"));

  expect(await screen.findByText(graduation.message)).toBeTruthy();
  expect(onSelectDay).not.toHaveBeenCalled();
});
