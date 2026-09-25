import AsyncStorage from "@react-native-async-storage/async-storage";
import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import * as Notifications from "expo-notifications";

import { usePushPrompt } from "@/store/pushPrompt";
import { renderExplainer, setUpExplainer } from "@/test/pushExplainerHarness";

/** "Not now" is an answer: nothing is raised, and the week starts counting. */

jest.mock("expo-router", () => ({ useSegments: () => ["(tabs)", "home"] }));

it("puts the sheet away, raises nothing, and remembers when it was offered", async () => {
  setUpExplainer("undetermined");
  const before = Date.now();
  await renderExplainer();
  expect(await screen.findByText("Know when your job moves")).toBeTruthy();

  fireEvent.press(screen.getByText("Not now"));

  await waitFor(() => expect(usePushPrompt.getState().open).toBe(false));
  expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
  const stored = JSON.parse((await AsyncStorage.getItem("gridgo.client.pushPrompt.v1")) ?? "{}");
  expect(stored.state.lastOfferedAt).toBeGreaterThanOrEqual(before);
});
