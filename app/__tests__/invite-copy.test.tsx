import { fireEvent, screen } from "@testing-library/react-native";

import InviteScreen from "@/app/invite";
import { inviteRead, LINK, setUpInvite } from "@/test/inviteHarness";
import { renderScreen } from "@/test/renderScreen";

/* Invite a friend → Copy link. One press, so its own file. */

jest.mock("expo-router", () => ({
  useFocusEffect: (effect: () => void) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useEffect } = require("react");
    useEffect(effect, [effect]);
  },
}));
jest.mock("@/lib/api", () => ({ ...jest.requireActual("@/lib/api"), createTesterInvite: jest.fn() }));
jest.mock("@/lib/copyText", () => ({ copyText: jest.fn(async () => true) }));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require("@/lib/api");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { copyText } = require("@/lib/copyText");

it("copies GRIDGO's link unchanged and says so", async () => {
  setUpInvite();
  api.createTesterInvite.mockResolvedValue(inviteRead());
  await renderScreen(<InviteScreen />);
  expect(await screen.findByText(LINK)).toBeTruthy();

  fireEvent.press(screen.getByRole("button", { name: "Copy link" }));

  expect(await screen.findByText("Link copied")).toBeTruthy();
  expect(copyText).toHaveBeenCalledWith(LINK);
});
