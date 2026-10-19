import { fireEvent, render, screen } from "@testing-library/react-native";

import { DeadlineCalendar } from "@/components/DeadlineCalendar";
import type { DeadlineDay } from "@/lib/api";
import { monthGrid } from "@/lib/deadlineCalendar";

const OCTOBER = new Date(2026, 9, 1);
const NOW = new Date(2026, 9, 9, 20, 40, 0);
// GRIDGO's earliest promise: Monday 19 October, 2:00 PM in Davao.
const EARLIEST = "2026-10-19T06:00:00.000Z";

/** Too soon until the 19th, then open, as the operating-hours API answers. */
function octoberAvailability(): DeadlineDay[] {
  return Array.from({ length: 23 }, (_, index) => {
    const day = `2026-10-${String(index + 9).padStart(2, "0")}`;
    return day < "2026-10-19"
      ? { day, state: "cannot", reason: "review_production_delivery_exceeds_deadline" }
      : { day, state: "open", reason: null };
  });
}

const daysFor = (month: Date) => monthGrid({ month, availability: octoberAvailability(), now: NOW });

function renderCalendar(onSelectDay = jest.fn()) {
  return render(
    <DeadlineCalendar
      daysFor={daysFor}
      month={OCTOBER}
      selectedDayKey={null}
      onSelectDay={onSelectDay}
      onStepMonth={jest.fn()}
      canStepBack={false}
      canStepForward={false}
      earliest={EARLIEST}
    />,
  );
}

it("says why an unreachable day cannot be had, without anyone tapping", async () => {
  await renderCalendar();

  expect(
    screen.getByLabelText(
      "13: Not possible. Too soon. Artwork review, printing and delivery take until Mon 19 Oct",
    ),
  ).toBeTruthy();
  expect(screen.getByLabelText("20: Secured")).toBeTruthy();
  expect(screen.getByText("Not possible: tap to see why")).toBeTruthy();
  expect(screen.queryByTestId("day-reason")).toBeNull();
});

// Presses, so it goes last in the file (see AGENTS.md on testing-library and React 19).
it("opens the reason under the month for a tapped unreachable day, without choosing it", async () => {
  const onSelectDay = jest.fn();
  await renderCalendar(onSelectDay);

  fireEvent.press(
    screen.getByLabelText("13: Not possible. Too soon. Artwork review, printing and delivery take until Mon 19 Oct"),
  );

  expect(await screen.findByTestId("day-reason")).toBeTruthy();
  expect(screen.getByText("Too soon. Artwork review, printing and delivery take until Mon 19 Oct.")).toBeTruthy();
  expect(onSelectDay).not.toHaveBeenCalled();
});
