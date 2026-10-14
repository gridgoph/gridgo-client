import { render, screen } from "@testing-library/react-native";

import { ReviewScheduleCard } from "@/components/ReviewScheduleCard";
import type { ReviewScheduleView } from "@/lib/operatingHours";

const closed: ReviewScheduleView = {
  closed: true,
  delayed: false,
  reviewAt: "tomorrow, 8:00 AM",
  length: "about 1 hour",
  readyBy: "2026-10-19T06:00:00.000Z",
};

it("lays out the run from now to the estimate at checkout", async () => {
  await render(<ReviewScheduleCard view={closed} variant="checkout" hours={["Mon–Sat · 8:00 AM – 5:00 PM"]} />);

  expect(screen.getByText("GRIDGO is closed right now")).toBeTruthy();
  expect(screen.getByText(/You can still place your order and pay/)).toBeTruthy();
  expect(screen.getByLabelText("Place your order and pay, Now")).toBeTruthy();
  expect(
    screen.getByLabelText("Artwork review, Tomorrow, 8:00 AM, About 1 hour, during opening hours"),
  ).toBeTruthy();
  expect(screen.getByText("Mon, Oct 19, 2026 · 2:00 PM")).toBeTruthy();
  expect(screen.getByText("Ready by, estimated")).toBeTruthy();
  expect(screen.getByText("GRIDGO reviews artwork Mon–Sat · 8:00 AM – 5:00 PM, Davao time.")).toBeTruthy();
  expect(screen.queryByText("Review delayed")).toBeNull();
});

it("starts a placed order at the review and flags a closure delay", async () => {
  await render(
    <ReviewScheduleCard
      view={{ ...closed, delayed: true, closed: false }}
      variant="order"
      closures={["Closed 12–13 Oct"]}
    />,
  );

  expect(screen.getByText("When GRIDGO reviews your artwork")).toBeTruthy();
  expect(screen.getByText(/Your ready-by date stays the same/)).toBeTruthy();
  expect(screen.getByText("Review delayed")).toBeTruthy();
  expect(screen.getByText("Closed 12–13 Oct")).toBeTruthy();
  expect(screen.queryByLabelText("Place your order and pay, Now")).toBeNull();
  // Placed, the date is GRIDGO's promise rather than an estimate.
  expect(screen.getByText("Ready by")).toBeTruthy();
  expect(screen.queryByText("Ready by, estimated")).toBeNull();
});
