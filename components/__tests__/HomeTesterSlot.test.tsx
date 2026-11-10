import { render, screen } from "@testing-library/react-native";

import { HomeTesterSlot } from "@/components/HomeTesterSlot";
import type { TesterProgramState } from "@/lib/api";
import { useSession } from "@/store/session";
import { useTesterProgram } from "@/store/testerProgram";

/** Home's tester line: nothing for a non-tester, Day N and the streak for a tester. */

jest.mock("@/lib/api", () => {
  const actual = jest.requireActual("@/lib/api");
  return { ...actual, reportTesterFeedback: jest.fn(() => Promise.resolve()) };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require("@/lib/api");

const enrolled = (overrides: object = {}): TesterProgramState => ({
  enrolled: true,
  app: "client",
  day: 3,
  streak: 3,
  checkedInToday: true,
  runComplete: false,
  stopped: false,
  manilaDate: "2026-11-07",
  nudge: null,
  ...overrides,
});

function signedInWith(program: TesterProgramState | null, extra: object = {}) {
  useSession.setState({ user: { id: "u1", name: "Tess", role: "client" } as never });
  useTesterProgram.setState({ owner: "u1", program, readAt: Date.parse("2026-11-07T12:00:00Z"), held: null, ...extra });
}

afterEach(() => {
  useTesterProgram.setState({ owner: null, program: null, held: null, checkingIn: false, checkInFailed: false });
});

it("draws nothing for an account that is not enrolled", async () => {
  signedInWith({ enrolled: false });
  await render(<HomeTesterSlot onOpenPlayOptin={jest.fn()} />);
  expect(screen.toJSON()).toBeNull();
});

it("shows Day N of 14, the streak and the done state once today is in", async () => {
  signedInWith(enrolled());
  await render(<HomeTesterSlot onOpenPlayOptin={jest.fn()} />);
  expect(screen.getByText("Day 3 of 14")).toBeTruthy();
  expect(screen.getByText("3-day streak")).toBeTruthy();
  expect(screen.getByText("Done for today")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Check in" })).toBeNull();
  expect(screen.getAllByTestId("tester-cell-done")).toHaveLength(3);
});

it("offers Check in with today's square open when the open could not check in", async () => {
  signedInWith(enrolled({ day: 4, checkedInToday: false }));
  await render(<HomeTesterSlot onOpenPlayOptin={jest.fn()} />);
  expect(screen.getByText("Day 4 of 14")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Check in" })).toBeTruthy();
  expect(screen.getAllByTestId("tester-cell-today")).toHaveLength(1);
});

it("puts GRIDGO's feedback ask in the card's place and reports it shown", async () => {
  signedInWith(enrolled({ nudge: { trigger: "streak_3" } }));
  await render(<HomeTesterSlot onOpenPlayOptin={jest.fn()} />);
  expect(screen.getByText("Help us launch")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Dismiss the feedback request" })).toBeTruthy();
  expect(screen.queryByText("Day 3 of 14")).toBeNull();
  expect(api.reportTesterFeedback).toHaveBeenCalledWith("shown", "streak_3");
});

it("keeps a dismissed card closed and shows the check-in again", async () => {
  const shownAt = Date.parse("2026-11-07T10:00:00Z");
  signedInWith(enrolled({ nudge: { trigger: "completed_order" } }), {
    held: { userId: "u1", trigger: "streak_3", shownAt, closed: true },
  });
  await render(<HomeTesterSlot onOpenPlayOptin={jest.fn()} />);
  expect(screen.queryByText("Help us launch")).toBeNull();
  expect(screen.getByText("Day 3 of 14")).toBeTruthy();
});

it("hides a held feedback card once the app is production approved", async () => {
  signedInWith(enrolled({ stopped: true, runComplete: false, nudge: null }), {
    held: { userId: "u1", trigger: "streak_3", shownAt: Date.parse("2026-11-07T11:00:00Z"), closed: false },
  });
  await render(<HomeTesterSlot onOpenPlayOptin={jest.fn()} />);
  expect(screen.queryByText("Help us launch")).toBeNull();
  expect(screen.toJSON()).toBeNull();
});

it("drops a held day-14 feedback card once a completed run is production approved", async () => {
  signedInWith(enrolled({ day: 14, streak: 14, runComplete: true, stopped: true, productionApproved: true, nudge: null }), {
    held: { userId: "u1", trigger: "streak_14", shownAt: Date.parse("2026-11-07T11:00:00Z"), closed: false },
  });
  await render(<HomeTesterSlot onOpenPlayOptin={jest.fn()} />);
  expect(screen.queryByText("Help us launch")).toBeNull();
});

it("keeps a held day-14 card on a completed run that is not approved, or from a GRIDGO without the field", async () => {
  const held = { userId: "u1", trigger: "streak_14" as const, shownAt: Date.parse("2026-11-07T11:00:00Z"), closed: false };
  signedInWith(enrolled({ day: 14, streak: 14, runComplete: true, stopped: true, productionApproved: false, nudge: null }), { held });
  await render(<HomeTesterSlot onOpenPlayOptin={jest.fn()} />);
  expect(screen.getByText("Help us launch")).toBeTruthy();
  signedInWith(enrolled({ day: 14, streak: 14, runComplete: true, stopped: true, nudge: null }), { held });
  await render(<HomeTesterSlot onOpenPlayOptin={jest.fn()} />);
  expect(screen.getByText("Help us launch")).toBeTruthy();
});
