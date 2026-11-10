import { fireEvent, screen } from "@testing-library/react-native";
import { Platform } from "react-native";

import PlayOptinScreen from "@/app/play-optin";
import { usePlayOptin } from "@/store/playOptin";
import { useSession } from "@/store/session";
import { playOptinState } from "@/test/playOptinFixtures";
import { renderScreen } from "@/test/renderScreen";

/** A custom address needs the person's word that it is a Google account (its own file: one event per file). */

jest.mock("expo-router", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useEffect } = require("react");
  return { useFocusEffect: (run: () => void) => useEffect(run, [run]) };
});

jest.mock("@/lib/api", () => {
  const actual = jest.requireActual("@/lib/api");
  return { ...actual, getPlayOptin: jest.fn(), confirmPlayOptinGmail: jest.fn(), reportPlayOptinEvent: jest.fn(() => Promise.resolve()) };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require("@/lib/api");
const originalOS = Platform.OS;
afterEach(() => {
  Platform.OS = originalOS;
});

it("asks for the Google-account box before a custom address can be confirmed", async () => {
  Platform.OS = "android";
  usePlayOptin.getState().reset();
  useSession.setState({ user: { id: "u1", name: "Tess", role: "client" } as never });
  api.getPlayOptin.mockResolvedValue(playOptinState({ gmailSuggestion: null }));
  await renderScreen(<PlayOptinScreen />);
  fireEvent.changeText(await screen.findByLabelText("Gmail address"), "tess@shop.ph");
  expect(await screen.findByRole("checkbox", { name: "This is my Google account" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Confirm" }).props.accessibilityState.disabled).toBe(true);
});
