import { fireEvent, screen } from "@testing-library/react-native";
import * as Notifications from "expo-notifications";
import { Linking } from "react-native";

import { renderExplainer, setUpExplainer } from "@/test/pushExplainerHarness";

/**
 * Refused twice on Android 13+: `canAskAgain` is false and the dialog will not
 * come back, so the explainer says so and hands over to the phone's settings.
 */

jest.mock("expo-router", () => ({ useSegments: () => ["(tabs)", "home"] }));

it("opens the phone's settings instead of a dialog Android will not show", async () => {
  const openSettings = jest.spyOn(Linking, "openSettings").mockResolvedValue(undefined);
  setUpExplainer("blocked");
  await renderExplainer();

  expect(await screen.findByText("Notifications are off for GRIDGO")).toBeTruthy();
  expect(screen.getByText(/cannot ask again/)).toBeTruthy();

  fireEvent.press(screen.getByText("Open phone settings"));

  expect(openSettings).toHaveBeenCalled();
  expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
});
