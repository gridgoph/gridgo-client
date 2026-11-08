import type { TesterProgramState } from "@/lib/api";
import type { TesterReminder } from "@/lib/testerProgram";
import { syncTesterReminders, useTesterProgram } from "@/store/testerProgram";

jest.mock("@/lib/api", () => {
  const actual = jest.requireActual("@/lib/api");
  return {
    ...actual,
    getTesterProgram: jest.fn(),
    testerCheckIn: jest.fn(),
    reportTesterFeedback: jest.fn(),
  };
});

const mockNotifications = {
  getAllScheduledNotificationsAsync: jest.fn(),
  cancelScheduledNotificationAsync: jest.fn(),
  getPermissionsAsync: jest.fn(),
  scheduleNotificationAsync: jest.fn(),
  SchedulableTriggerInputTypes: { DATE: "date" },
};

jest.mock("@/store/push", () => ({ getNotificationsNative: () => mockNotifications }));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require("@/lib/api");

const enrolled = (overrides: object = {}): TesterProgramState => ({
  enrolled: true,
  app: "client",
  day: 4,
  streak: 3,
  checkedInToday: false,
  runComplete: false,
  stopped: false,
  manilaDate: "2026-11-07",
  nudge: null,
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
  useTesterProgram.getState().reset();
  useTesterProgram.setState({ held: null });
  mockNotifications.getAllScheduledNotificationsAsync.mockResolvedValue([]);
  mockNotifications.getPermissionsAsync.mockResolvedValue({ granted: true });
  api.reportTesterFeedback.mockResolvedValue(undefined);
});

it("checks in on open for an enrolled tester whose day is not yet in", async () => {
  api.getTesterProgram.mockResolvedValue(enrolled());
  api.testerCheckIn.mockResolvedValue(enrolled({ checkedInToday: true }));

  await useTesterProgram.getState().load("u1");

  expect(api.testerCheckIn).toHaveBeenCalledWith(expect.any(String), "open");
  expect(useTesterProgram.getState().program).toMatchObject({ checkedInToday: true });
});

it("asks nothing more of an account that is not enrolled, and cancels any reminder", async () => {
  mockNotifications.getAllScheduledNotificationsAsync.mockResolvedValue([
    { identifier: "gridgo-tester-evening-2026-11-07" },
    { identifier: "something-else" },
  ]);
  api.getTesterProgram.mockResolvedValue({ enrolled: false });

  await useTesterProgram.getState().load("u1");
  await new Promise((resolve) => setTimeout(resolve, 0));

  expect(api.testerCheckIn).not.toHaveBeenCalled();
  expect(mockNotifications.cancelScheduledNotificationAsync).toHaveBeenCalledTimes(1);
  expect(mockNotifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith("gridgo-tester-evening-2026-11-07");
  expect(mockNotifications.scheduleNotificationAsync).not.toHaveBeenCalled();
});

it("stays silent when the read fails", async () => {
  api.getTesterProgram.mockRejectedValue(new Error("offline"));
  await expect(useTesterProgram.getState().load("u1")).resolves.toBeUndefined();
  expect(useTesterProgram.getState().program).toBeNull();
});

it("schedules local reminders only with permission already granted, and never asks", async () => {
  const plan: TesterReminder[] = [{ id: "gridgo-tester-evening-x", at: Date.now() + 60_000, title: "Day 4 of 14", body: "b" }];
  mockNotifications.getPermissionsAsync.mockResolvedValue({ granted: false });
  await syncTesterReminders(plan);
  expect(mockNotifications.scheduleNotificationAsync).not.toHaveBeenCalled();

  mockNotifications.getPermissionsAsync.mockResolvedValue({ granted: true });
  await syncTesterReminders(plan);
  expect(mockNotifications.scheduleNotificationAsync).toHaveBeenCalledWith(
    expect.objectContaining({
      identifier: "gridgo-tester-evening-x",
      content: expect.objectContaining({ title: "Day 4 of 14", data: { type: "tester_reminder" } }),
      trigger: expect.objectContaining({ type: "date", date: new Date(plan[0].at) }),
    }),
  );
});

it("reports a shown card, then holds it closed once dismissed", () => {
  useTesterProgram.setState({ owner: "u1" });
  useTesterProgram.getState().feedbackShown("streak_3", 1_000);
  expect(api.reportTesterFeedback).toHaveBeenCalledWith("shown", "streak_3");

  useTesterProgram.getState().feedbackDismissed();
  expect(api.reportTesterFeedback).toHaveBeenCalledWith("dismissed", "streak_3");
  expect(useTesterProgram.getState().held).toEqual({ userId: "u1", trigger: "streak_3", shownAt: 1_000, closed: true });
});
