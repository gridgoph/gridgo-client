import { fireEvent, render, screen } from "@testing-library/react-native";
import { Platform } from "react-native";

import { HomeTesterSlot } from "@/components/HomeTesterSlot";
import { PLAY_OPTIN_COPY } from "@/lib/playOptin";
import { usePlayOptin } from "@/store/playOptin";
import { useSession } from "@/store/session";
import { useTesterProgram } from "@/store/testerProgram";
import type { PlayOptinState } from "@/lib/api";
import { playOptinState } from "@/test/playOptinFixtures";

/** Home's Play opt-in ask: Android APK only, GRIDGO's show, gone for the session once closed. */

jest.mock("@/lib/api", () => {
  const actual = jest.requireActual("@/lib/api");
  return { ...actual, reportPlayOptinEvent: jest.fn(() => Promise.resolve()), reportTesterFeedback: jest.fn(() => Promise.resolve()) };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require("@/lib/api");

const state = playOptinState;

const originalOS = Platform.OS;

function signedInWith(optin: PlayOptinState | null) {
  useSession.setState({ user: { id: "u1", name: "Tess", role: "client" } as never });
  useTesterProgram.setState({ owner: "u1", program: { enrolled: false }, held: null });
  usePlayOptin.setState({ owner: "u1", state: optin, dismissedThisSession: false, reported: { owner: "u1", shown: false, tapped: false } });
}

beforeEach(() => {
  jest.clearAllMocks();
  Platform.OS = "android";
});

afterEach(() => {
  Platform.OS = originalOS;
  usePlayOptin.getState().reset();
});

it("shows the ask on an Android APK and reports it shown", async () => {
  signedInWith(state());
  await render(<HomeTesterSlot onOpenPlayOptin={jest.fn()} />);
  expect(screen.getByRole("button", { name: PLAY_OPTIN_COPY })).toBeTruthy();
  expect(screen.getByText("Become a tester")).toBeTruthy();
  expect(api.reportPlayOptinEvent).toHaveBeenCalledWith({ platform: "android", channel: "sideload" }, "shown");
});

it("draws nothing on iOS", async () => {
  Platform.OS = "ios";
  signedInWith(state());
  await render(<HomeTesterSlot onOpenPlayOptin={jest.fn()} />);
  expect(screen.toJSON()).toBeNull();
  expect(api.reportPlayOptinEvent).not.toHaveBeenCalled();
});

it("draws nothing once GRIDGO stops asking (opted in or three dismissals)", async () => {
  signedInWith(state({ show: false, dismissCount: 3 }));
  await render(<HomeTesterSlot onOpenPlayOptin={jest.fn()} />);
  expect(screen.toJSON()).toBeNull();
});

it("draws nothing after a close in this session", async () => {
  signedInWith(state({ dismissCount: 1 }));
  usePlayOptin.setState({ dismissedThisSession: true });
  await render(<HomeTesterSlot onOpenPlayOptin={jest.fn()} />);
  expect(screen.toJSON()).toBeNull();
});

it("puts the opt-in ahead of an enrolled APK tester's check-in and feedback cards", async () => {
  signedInWith(state());
  useTesterProgram.setState({
    program: {
      enrolled: true,
      app: "client",
      day: 3,
      streak: 3,
      checkedInToday: true,
      runComplete: false,
      stopped: false,
      manilaDate: "2026-11-10",
      nudge: { trigger: "streak_3" },
    },
    readAt: Date.parse("2026-11-10T12:00:00Z"),
  });
  await render(<HomeTesterSlot onOpenPlayOptin={jest.fn()} />);
  expect(screen.getByRole("button", { name: PLAY_OPTIN_COPY })).toBeTruthy();
  expect(screen.queryByText("Day 3 of 14")).toBeNull();
  expect(screen.queryByText("Leave feedback on Google Play")).toBeNull();
  // The feedback ask it hides is not counted as seen.
  expect(useTesterProgram.getState().held).toBeNull();
  expect(api.reportTesterFeedback).not.toHaveBeenCalled();
});

it("hands the slot back to the check-in once opted in", async () => {
  signedInWith(state({ show: false, optedIn: true, step: "opted_in" }));
  useTesterProgram.setState({
    program: { enrolled: true, app: "client", day: 1, streak: 1, checkedInToday: true, runComplete: false, stopped: false, manilaDate: "2026-11-10", nudge: null },
  });
  await render(<HomeTesterSlot onOpenPlayOptin={jest.fn()} />);
  expect(screen.getByText("Day 1 of 14")).toBeTruthy();
  expect(screen.queryByRole("button", { name: PLAY_OPTIN_COPY })).toBeNull();
});

it("reports the tap and opens the steps", async () => {
  signedInWith(state());
  const open = jest.fn();
  await render(<HomeTesterSlot onOpenPlayOptin={open} />);
  fireEvent.press(screen.getByRole("button", { name: PLAY_OPTIN_COPY }));
  expect(open).toHaveBeenCalled();
  expect(api.reportPlayOptinEvent).toHaveBeenCalledWith({ platform: "android", channel: "sideload" }, "tapped");
});
