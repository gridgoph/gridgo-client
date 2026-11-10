import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { Platform } from "react-native";

import { HomeTesterSlot } from "@/components/HomeTesterSlot";
import { usePlayOptin } from "@/store/playOptin";
import { useSession } from "@/store/session";
import { useTesterProgram } from "@/store/testerProgram";
import { playOptinState } from "@/test/playOptinFixtures";

/** Closing the ask reports one dismissal and takes the card away (its own file: one press per file). */

jest.mock("@/lib/api", () => {
  const actual = jest.requireActual("@/lib/api");
  return { ...actual, reportPlayOptinEvent: jest.fn(() => Promise.resolve()) };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require("@/lib/api");

const originalOS = Platform.OS;
afterEach(() => {
  Platform.OS = originalOS;
});

it("reports the dismissal and hides the card", async () => {
  Platform.OS = "android";
  useSession.setState({ user: { id: "u1", name: "Tess", role: "client" } as never });
  useTesterProgram.setState({ owner: "u1", program: { enrolled: false }, held: null });
  usePlayOptin.setState({
    owner: "u1",
    dismissedThisSession: false,
    state: playOptinState({ gmailSuggestion: null, dismissCount: 2 }),
  });
  await render(<HomeTesterSlot onOpenPlayOptin={jest.fn()} />);
  fireEvent.press(screen.getByRole("button", { name: "Not now" }));
  expect(api.reportPlayOptinEvent).toHaveBeenCalledWith({ platform: "android", channel: "sideload" }, "dismissed");
  await waitFor(() => expect(screen.queryByText("Become a tester")).toBeNull());
});
