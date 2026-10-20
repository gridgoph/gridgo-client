import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import { Share } from "react-native";

import InviteScreen from "@/app/invite";
import { inviteRead, LINK, setUpInvite } from "@/test/inviteHarness";
import { renderScreen } from "@/test/renderScreen";

/* Invite a friend → Share. One press, so its own file. */

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

it("opens the phone's share sheet with the link in it", async () => {
  const share = jest.spyOn(Share, "share").mockResolvedValue({ action: "sharedAction" });
  setUpInvite();
  api.createTesterInvite.mockResolvedValue(inviteRead());
  await renderScreen(<InviteScreen />);
  expect(await screen.findByText(LINK)).toBeTruthy();

  fireEvent.press(screen.getByRole("button", { name: "Share" }));

  await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
  const [content] = share.mock.calls[0];
  expect(content).toEqual(expect.objectContaining({ url: LINK, message: expect.stringContaining(LINK) }));
});
