import { act, render, screen } from "@testing-library/react-native";

import { IssueWindowCountdown } from "@/components/IssueWindowCountdown";

const HOUR = 60 * 60 * 1000;
const NOW = new Date("2026-10-15T10:00:00+08:00").getTime();

beforeEach(() => {
  jest.useFakeTimers({ now: NOW });
});

afterEach(() => {
  jest.useRealTimers();
});

it("ticks down every second to the expiry the order carries", async () => {
  await render(
    <IssueWindowCountdown
      openedAt={new Date(NOW - 2 * HOUR).toISOString()}
      expiresAt={new Date(NOW + 21 * HOUR + 47 * 60_000 + 9_000).toISOString()}
      windowHours={24}
      elapsedLabel="Delivered 2 hours ago"
    />,
  );

  expect(screen.getByText("21:47:09")).toBeTruthy();
  expect(screen.getByText("Check window closes in")).toBeTruthy();
  expect(screen.getByText(/^Closes .+2026/)).toBeTruthy();
  expect(screen.getByText("Delivered 2 hours ago")).toBeTruthy();

  await act(async () => {
    jest.advanceTimersByTime(3_000);
  });
  expect(screen.getByText("21:47:06")).toBeTruthy();
  // Announced in minutes, never second by second.
  expect(screen.getByLabelText(/^Check window\. 21 hours 47 minutes left\. Closes /)).toBeTruthy();
});

it("asks for the closed order once, when the clock reaches zero", async () => {
  const onElapsed = jest.fn();
  await render(
    <IssueWindowCountdown
      openedAt={new Date(NOW - 24 * HOUR).toISOString()}
      expiresAt={new Date(NOW + 2_000).toISOString()}
      windowHours={24}
      elapsedLabel={null}
      onElapsed={onElapsed}
    />,
  );
  expect(screen.getByText("00:00:02")).toBeTruthy();
  expect(onElapsed).not.toHaveBeenCalled();

  await act(async () => {
    jest.advanceTimersByTime(5_000);
  });
  expect(screen.getByText("00:00:00")).toBeTruthy();
  expect(screen.getByText("Check window closing now")).toBeTruthy();
  expect(onElapsed).toHaveBeenCalledTimes(1);
});

it("draws nothing for an order that carries no expiry", async () => {
  await render(
    <IssueWindowCountdown openedAt={null} expiresAt={null} windowHours={24} elapsedLabel={null} />,
  );
  expect(screen.queryByTestId("issue-window-countdown")).toBeNull();
});
