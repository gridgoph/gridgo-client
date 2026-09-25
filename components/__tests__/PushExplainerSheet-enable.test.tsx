import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

import * as api from "@/lib/api";
import { PUSH_CHANNEL_ID } from "@/lib/push";
import { usePushPrompt } from "@/store/pushPrompt";
import { renderExplainer, setUpExplainer } from "@/test/pushExplainerHarness";

/** The first landing after sign-in: the explainer, then the one real ask. */

jest.mock("expo-router", () => ({ useSegments: () => ["(tabs)", "home"] }));

const mocked = Notifications as jest.Mocked<typeof Notifications>;

beforeAll(() => {
  Object.defineProperty(Platform, "OS", { value: "android", configurable: true });
});

it("creates the channel, raises the dialog, and registers the phone on yes", async () => {
  setUpExplainer("undetermined");
  api.setToken("session-token");
  mocked.requestPermissionsAsync.mockResolvedValue({
    status: "granted",
    granted: true,
    canAskAgain: true,
  } as never);
  mocked.getDevicePushTokenAsync.mockResolvedValue({ type: "android", data: "fcm-1" } as never);
  const register = jest.spyOn(api, "registerDevice").mockResolvedValue(undefined as never);

  await renderExplainer();
  // Nothing has asked the OS yet: the sheet is only words and two buttons.
  expect(await screen.findByText("Know when your job moves")).toBeTruthy();
  expect(mocked.requestPermissionsAsync).not.toHaveBeenCalled();

  fireEvent.press(screen.getByText("Turn on notifications"));

  await waitFor(() => expect(register).toHaveBeenCalledWith("fcm-1", "android", expect.anything()));
  const channelAt = mocked.setNotificationChannelAsync.mock.invocationCallOrder[0];
  const askAt = mocked.requestPermissionsAsync.mock.invocationCallOrder[0];
  expect(mocked.setNotificationChannelAsync).toHaveBeenCalledWith(PUSH_CHANNEL_ID, expect.anything());
  expect(channelAt).toBeLessThan(askAt);
  expect(usePushPrompt.getState().open).toBe(false);
  api.setToken(null);
});
