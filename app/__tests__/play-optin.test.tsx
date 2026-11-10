import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import { Linking, Platform } from "react-native";

import PlayOptinScreen from "@/app/play-optin";
import { usePlayOptin } from "@/store/playOptin";
import { useSession } from "@/store/session";
import { APK_INSTALL, playOptinState } from "@/test/playOptinFixtures";
import { renderScreen } from "@/test/renderScreen";

/** The opt-in steps, as GRIDGO answers them. Presses go last (one press per file). */

jest.mock("expo-router", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useEffect } = require("react");
  return { useFocusEffect: (run: () => void) => useEffect(run, [run]) };
});

jest.mock("@/lib/api", () => {
  const actual = jest.requireActual("@/lib/api");
  return { ...actual, getPlayOptin: jest.fn(), confirmPlayOptinGmail: jest.fn(), reportPlayOptinEvent: jest.fn() };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require("@/lib/api");

const originalOS = Platform.OS;

beforeEach(() => {
  jest.clearAllMocks();
  Platform.OS = "android";
  usePlayOptin.getState().reset();
  useSession.setState({ user: { id: "u1", name: "Tess", role: "client" } as never });
  api.reportPlayOptinEvent.mockResolvedValue(undefined);
});

afterEach(() => {
  Platform.OS = originalOS;
});

it("opens on the Gmail step, prefilled, and counts the entry as a tap", async () => {
  api.getPlayOptin.mockResolvedValue(playOptinState());
  await renderScreen(<PlayOptinScreen />);
  expect(await screen.findByDisplayValue("tess@gmail.com")).toBeTruthy();
  for (const title of ["Confirm your Gmail", "Join the tester group", "Become a tester", "Install from Play"]) {
    expect(screen.getAllByText(title).length).toBeGreaterThan(0);
  }
  expect(screen.queryByRole("checkbox")).toBeNull();
  await waitFor(() => expect(api.reportPlayOptinEvent).toHaveBeenCalledWith(APK_INSTALL, "tapped"));
});

it("offers only a Gmail as-is: another sign-in address starts empty", async () => {
  api.getPlayOptin.mockResolvedValue(playOptinState({ gmailSuggestion: "tess@shop.ph" }));
  await renderScreen(<PlayOptinScreen />);
  expect(await screen.findByLabelText("Gmail address")).toBeTruthy();
  expect(screen.queryByDisplayValue("tess@shop.ph")).toBeNull();
  expect(screen.getByRole("button", { name: "Confirm" }).props.accessibilityState.disabled).toBe(true);
});

it("says so once the person is a tester", async () => {
  api.getPlayOptin.mockResolvedValue(playOptinState({ show: false, optedIn: true, step: "opted_in" }));
  await renderScreen(<PlayOptinScreen />);
  expect(await screen.findByText("You're a tester")).toBeTruthy();
  expect(api.reportPlayOptinEvent).not.toHaveBeenCalled();
});

it("does nothing when GRIDGO is not asking", async () => {
  api.getPlayOptin.mockResolvedValue(playOptinState({ show: false, dismissCount: 3 }));
  await renderScreen(<PlayOptinScreen />);
  expect(await screen.findByText("Not open right now")).toBeTruthy();
  expect(api.reportPlayOptinEvent).not.toHaveBeenCalled();
});

it("is Android only", async () => {
  Platform.OS = "ios";
  await renderScreen(<PlayOptinScreen />);
  expect(screen.getByText("Android only")).toBeTruthy();
  expect(api.getPlayOptin).not.toHaveBeenCalled();
});

it("tells an APK user to install from Play after the opt-in", async () => {
  api.getPlayOptin.mockResolvedValue(playOptinState({ step: "install_from_play" }));
  await renderScreen(<PlayOptinScreen />);
  expect(await screen.findByRole("button", { name: "Install from Play" })).toBeTruthy();
  expect(screen.getByText("tess@gmail.com")).toBeTruthy();
});

it("link mode: Join group opens the group and reports it", async () => {
  const openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(true);
  api.getPlayOptin.mockResolvedValue(playOptinState({ step: "join_group" }));
  await renderScreen(<PlayOptinScreen />);
  fireEvent.press(await screen.findByRole("button", { name: "Join group" }));
  await waitFor(() => expect(api.reportPlayOptinEvent).toHaveBeenCalledWith(APK_INSTALL, "group_opened"));
  await waitFor(() => expect(openURL).toHaveBeenCalledWith("https://groups.google.com/g/example-testers"));
  openURL.mockRestore();
});
