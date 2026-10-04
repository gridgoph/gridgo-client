import AsyncStorage from "@react-native-async-storage/async-storage";

import { pushExplainerDue } from "@/lib/push";
import { usePushPrompt } from "@/store/pushPrompt";

/**
 * The explainer's clock. "Not now" must survive a relaunch, or the seven-day
 * hold becomes a sheet on every cold start.
 */

beforeEach(() => {
  usePushPrompt.getState().reset();
});

it("stamps the offer when the explainer opens, and keeps it after dismissal", () => {
  usePushPrompt.getState().offer("ask", 1_000);
  expect(usePushPrompt.getState()).toMatchObject({ open: true, mode: "ask", lastOfferedAt: 1_000 });

  usePushPrompt.getState().dismiss();
  expect(usePushPrompt.getState()).toMatchObject({ open: false, lastOfferedAt: 1_000 });
});

it("persists when it was offered, and nothing about whether it is on screen", async () => {
  usePushPrompt.getState().offer("settings", 42_000);

  const stored = await AsyncStorage.getItem("gridgo.client.pushPrompt.v1");
  expect(JSON.parse(stored ?? "{}").state).toEqual({ lastOfferedAt: 42_000 });
});

it("lets onboarding's notification page start the clock without drawing the sheet", () => {
  usePushPrompt.getState().markOffered(5_000);
  expect(usePushPrompt.getState()).toMatchObject({ open: false, lastOfferedAt: 5_000 });
  // So the explainer on Home does not ask a second time straight after (#159).
  expect(
    pushExplainerDue({
      supported: true,
      signedIn: true,
      permission: "undetermined",
      lastOfferedAt: usePushPrompt.getState().lastOfferedAt,
      now: 5_000 + 60_000,
    }),
  ).toBeNull();
});
