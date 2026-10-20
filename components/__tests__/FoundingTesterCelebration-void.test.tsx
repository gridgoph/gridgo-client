import { act, screen } from "@testing-library/react-native";

import { useSession } from "@/store/session";
import { CELEBRATION_TITLE, EARNED, renderCelebration, setUpCelebration } from "@/test/foundingTesterHarness";

/** One test: the celebration opens (a store write from an effect), then the account is re-read. */

jest.mock("expo-router", () => ({
  useSegments: () => ["(tabs)", "home"],
  router: { push: jest.fn() },
}));

it("stops promising the voucher once GRIDGO voids it while the sheet is open (review finding 4)", async () => {
  setUpCelebration();
  await renderCelebration();
  expect(await screen.findByText(CELEBRATION_TITLE)).toBeTruthy();
  expect(screen.getByText(/A ₱15 voucher is in your wallet/)).toBeTruthy();

  // An identity refresh brings the same award back, voided.
  await act(async () => {
    useSession.setState({
      user: { id: "u1", email: "client@gridgo.local", name: "Client", role: "client", foundingTester: { ...EARNED, rewardStatus: "voided" } },
    } as never);
  });

  expect(await screen.findByText(/The label is yours to keep/)).toBeTruthy();
  expect(screen.queryByText(/in your wallet/)).toBeNull();
  expect(screen.queryByText(/Use it on an order/)).toBeNull();
  // Still the same moment, not a second celebration.
  expect(screen.getByText(CELEBRATION_TITLE)).toBeTruthy();
});
