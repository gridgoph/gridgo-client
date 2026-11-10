import { fireEvent, screen } from "@testing-library/react-native";
import { Platform } from "react-native";

import PlayOptinScreen from "@/app/play-optin";
import { ApiError } from "@/lib/api";
import { usePlayOptin } from "@/store/playOptin";
import { useSession } from "@/store/session";
import { playOptinState } from "@/test/playOptinFixtures";
import { renderScreen } from "@/test/renderScreen";

/** A failed first read is said, with Retry, never an endless skeleton (its own file: one press per file). */

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

it("shows Try again after a failed read, and the Gmail step once the retry lands", async () => {
  Platform.OS = "android";
  usePlayOptin.getState().reset();
  useSession.setState({ user: { id: "u1", name: "Tess", role: "client" } as never });
  api.getPlayOptin.mockRejectedValueOnce(new ApiError(503, { error: "service_unavailable" })).mockResolvedValue(playOptinState());
  await renderScreen(<PlayOptinScreen />);
  expect(await screen.findByText("Couldn't load your steps")).toBeTruthy();
  expect(screen.queryByTestId("optin-loading")).toBeNull();
  fireEvent.press(screen.getByRole("button", { name: "Try again" }));
  expect(await screen.findByDisplayValue("tess@gmail.com")).toBeTruthy();
  expect(screen.queryByText("Couldn't load your steps")).toBeNull();
  expect(usePlayOptin.getState().readFailed).toBe(false);
});
