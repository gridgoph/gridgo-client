import { screen } from "@testing-library/react-native";

import FoundingTesterScreen from "@/app/founding-tester";
import { renderScreen } from "@/test/renderScreen";
import { EARNED, setUpTester, STEPS_TWO_DONE, summaryWith } from "@/test/foundingTesterScreen";

/**
 * The Founding Tester screen (client#335). Every tick is GRIDGO's: two steps
 * done means two Done rows, one Current step with its one button, and the
 * rest locked behind the step before them.
 */

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  useFocusEffect: (effect: () => void) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useEffect } = require("react");
    useEffect(effect, [effect]);
  },
}));

jest.mock("@/lib/api", () => {
  const actual = jest.requireActual("@/lib/api");
  return {
    ...actual,
    listOrders: jest.fn(async () => []),
    getHomeSummary: jest.fn(async () => null),
    getAccount: jest.fn(() => new Promise(() => {})),
    listOpenSurveys: jest.fn(async () => ({ surveys: [] })),
  };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require("@/lib/api");

it("shows Done, one Current step and Locked steps from GRIDGO's ticks", async () => {
  setUpTester(STEPS_TWO_DONE);
  api.getHomeSummary.mockResolvedValue(summaryWith({ bugReport: { rewardAvailable: true, amountMinor: 1500 } }));
  await renderScreen(<FoundingTesterScreen />);

  expect(await screen.findByText("Become a Founding Tester")).toBeTruthy();
  expect(screen.getAllByText("Done")).toHaveLength(2);
  expect(screen.getByLabelText(/^Step 3 of 5, .*, next step/)).toBeTruthy();
  expect(screen.getByText("Unlocks after step 3")).toBeTruthy();
  expect(screen.getByText("Unlocks after step 4")).toBeTruthy();
  // The bug tile carries the reward while GRIDGO says it is still available.
  expect(await screen.findByText("Earn ₱15 · once")).toBeTruthy();
});

it("leaves the reward tag off once the bug reward is spent", async () => {
  setUpTester(STEPS_TWO_DONE);
  api.getHomeSummary.mockResolvedValue(summaryWith());
  await renderScreen(<FoundingTesterScreen />);

  expect(await screen.findByText("Report a bug")).toBeTruthy();
  expect(screen.getByText("Tell GRIDGO what broke")).toBeTruthy();
  expect(screen.queryByText(/Earn ₱15/)).toBeNull();
});

it("shows the voucher's code, Copy and expiry once all five count", async () => {
  setUpTester(EARNED);
  api.getHomeSummary.mockResolvedValue(
    summaryWith({
      tile: "tester_voucher",
      testerVoucher: {
        voucherId: "vch_1",
        kind: "mission",
        valueMinor: 1500,
        code: "A1B2C3D4E5F60718",
        expiresAt: "2026-11-19T08:00:00.000Z",
        secondsRemaining: 1,
        daysLeft: 17,
        redeemable: true,
        reserved: false,
      },
    }),
  );
  await renderScreen(<FoundingTesterScreen />);

  expect(await screen.findByText("You're a Founding Tester!")).toBeTruthy();
  expect(await screen.findByText("A1B2 C3D4 E5F6 0718")).toBeTruthy();
  expect(screen.getByLabelText("Copy voucher code")).toBeTruthy();
  expect(screen.getByText(/YOUR VOUCHER · EXPIRES /)).toBeTruthy();
});
