import { screen } from "@testing-library/react-native";

import InviteScreen from "@/app/invite";
import { inviteRead, LINK, setUpInvite } from "@/test/inviteHarness";
import { renderScreen } from "@/test/renderScreen";

/* Invite a friend: what it shows. No presses here; Copy and Share have their own files. */

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

beforeEach(() => {
  setUpInvite();
  api.createTesterInvite.mockReset();
});

it("asks GRIDGO for the code and shows the link, the counts and who earns what", async () => {
  api.createTesterInvite.mockResolvedValue(inviteRead());
  await renderScreen(<InviteScreen />);

  expect(await screen.findByText(LINK)).toBeTruthy();
  // With this installation's ID, so GRIDGO can compare it with the friend's.
  expect(api.createTesterInvite).toHaveBeenCalledWith(expect.stringMatching(/^[0-9a-f-]{36}$/));
  expect(
    screen.getByText(
      "When a friend signs up with your link and finishes all five Founding Tester steps, you each get an invite voucher, valid 30 days. Your friend's comes on top of their own Founding Tester voucher. Signing up alone does not earn one.",
    ),
  ).toBeTruthy();
  expect(screen.getByLabelText("Invited: 3. Sent the sign-up form with your code")).toBeTruthy();
  expect(screen.getByLabelText("Joined: 2. Have a GRIDGO account")).toBeTruthy();
  expect(screen.getByLabelText("Completed: 1. Finished all five steps. Vouchers still depend on GRIDGO's checks")).toBeTruthy();
  expect(screen.getByText(/GRIDGO also has a monthly voucher budget/)).toBeTruthy();
  expect(screen.queryByText(/₱/)).toBeNull();
  expect(screen.getByRole("button", { name: "Share" })).toBeEnabled();
  expect(screen.getByRole("button", { name: "Copy link" })).toBeEnabled();
});

it("holds Copy and Share until Operations has set the sign-up form", async () => {
  api.createTesterInvite.mockResolvedValue(inviteRead({ link: null, invited: 0, joined: 0, completed: 0 }));
  await renderScreen(<InviteScreen />);

  expect(await screen.findByText(/Your link is not ready yet/)).toBeTruthy();
  expect(screen.getByRole("button", { name: "Share" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Copy link" })).toBeDisabled();
  expect(screen.getByLabelText("Invited: 0. Sent the sign-up form with your code")).toBeTruthy();
});

it("says so when the invite cannot be read, and offers to try again", async () => {
  api.createTesterInvite.mockRejectedValue(new api.ApiError(503, { error: "unavailable" }));
  await renderScreen(<InviteScreen />);

  expect(await screen.findByText("Could not load your invite")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Share" })).toBeNull();
});
