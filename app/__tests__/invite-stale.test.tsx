import { screen } from "@testing-library/react-native";

import InviteScreen from "@/app/invite";
import { useFoundingTester } from "@/store/foundingTester";
import { inviteRead, LINK, setUpInvite } from "@/test/inviteHarness";
import { renderScreen } from "@/test/renderScreen";

/* One test: a refresh that fails after an earlier good read. No presses. */

jest.mock("expo-router", () => ({
  useFocusEffect: (effect: () => void) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useEffect } = require("react");
    useEffect(effect, [effect]);
  },
}));
jest.mock("@/lib/api", () => ({ ...jest.requireActual("@/lib/api"), createTesterInvite: jest.fn() }));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require("@/lib/api");

it("says a failed refresh failed, marks the counts last known and does not hand out the old link (review finding 2)", async () => {
  setUpInvite();
  // The screen was opened before and read fine.
  useFoundingTester.setState({ invites: inviteRead().invites, inviteStatus: "ready" });
  api.createTesterInvite.mockRejectedValue(new api.ApiError(503, { error: "unavailable" }));
  await renderScreen(<InviteScreen />);

  expect(await screen.findByText("Could not refresh your invite")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
  expect(screen.getByText("YOUR INVITES · LAST KNOWN")).toBeTruthy();
  expect(screen.queryByText(LINK)).toBeNull();
  expect(screen.getByRole("button", { name: "Share" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Copy link" })).toBeDisabled();
});
