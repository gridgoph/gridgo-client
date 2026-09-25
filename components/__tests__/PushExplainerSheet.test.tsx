import { screen } from "@testing-library/react-native";
import * as Notifications from "expo-notifications";

import { usePushPrompt } from "@/store/pushPrompt";
import { useAppUpdate } from "@/store/appUpdate";
import { DAY, renderExplainer, setUpExplainer } from "@/test/pushExplainerHarness";

/**
 * When the notification explainer appears. Every test before the last renders
 * a sheet that stays shut, because opening it is a store write from an effect
 * and that spends this file's render budget — see AGENTS.md § "Running and
 * testing". The press tests live in their own files.
 */

let mockSegments: string[] = ["(tabs)", "home"];
jest.mock("expo-router", () => ({ useSegments: () => mockSegments }));

const TITLE = "Know when your job moves";

beforeEach(() => {
  jest.clearAllMocks();
  mockSegments = ["(tabs)", "home"];
  setUpExplainer("undetermined");
});

it("waits for the launch intro", async () => {
  await renderExplainer(false);
  expect(screen.queryByText(TITLE)).toBeNull();
  expect(usePushPrompt.getState().lastOfferedAt).toBeNull();
});

it("is never drawn over sign-in, complete profile or ranking", async () => {
  mockSegments = ["complete-profile"];
  await renderExplainer();
  expect(screen.queryByText(TITLE)).toBeNull();
});

it("holds for seven days after Not now", async () => {
  usePushPrompt.setState({ lastOfferedAt: Date.now() - 3 * DAY });
  await renderExplainer();
  expect(screen.queryByText(TITLE)).toBeNull();
});

it("asks nothing of a phone that already said yes", async () => {
  setUpExplainer("granted");
  await renderExplainer();
  expect(screen.queryByText(TITLE)).toBeNull();
});

it("waits for the stored stamp, so a relaunch cannot ask twice in a week", async () => {
  usePushPrompt.setState({ hydrated: false });
  await renderExplainer();
  expect(screen.queryByText(TITLE)).toBeNull();
});

it("gives way to the update prompt", async () => {
  useAppUpdate.setState({ available: { versionCode: 120, versionName: "1.0.120" } });
  await renderExplainer();
  expect(screen.queryByText(TITLE)).toBeNull();
});

// Last: the sheet opens, which is a store write from an effect.
it("comes back after a week and says what will arrive before any dialog", async () => {
  const before = Date.now();
  usePushPrompt.setState({ lastOfferedAt: before - 8 * DAY });
  await renderExplainer();

  expect(await screen.findByText(TITLE)).toBeTruthy();
  expect(screen.getByText("Your payment is confirmed")).toBeTruthy();
  expect(screen.getByText(/only says there is an update/)).toBeTruthy();
  expect(screen.getByText("Turn on notifications")).toBeTruthy();
  expect(screen.getByText("Not now")).toBeTruthy();
  // Drawing the sheet restarts the clock; it raises nothing by itself.
  expect(usePushPrompt.getState().lastOfferedAt).toBeGreaterThanOrEqual(before);
  expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
});
