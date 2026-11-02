import type { FoundingTester, HomeSummary } from "@/lib/api";
import { useCart } from "@/store/cart";
import { useFoundingTester } from "@/store/foundingTester";
import { useSession } from "@/store/session";

/** Shared set-up for the Founding Tester screen's tests (client#335). */

export const STEPS_TWO_DONE: FoundingTester = {
  eligible: true,
  label: null,
  awardedAt: null,
  missions: { added: true, placed: true, tracked: false, received: false, rated: false },
  completedCount: 2,
  rewardStatus: "pending",
  reward: null,
};

export const EARNED: FoundingTester = {
  eligible: true,
  label: "Founding Tester",
  awardedAt: "2026-10-20T08:00:00.000Z",
  missions: { added: true, placed: true, tracked: true, received: true, rated: true },
  completedCount: 5,
  rewardStatus: "issued",
  reward: { id: "vch_1", valueMinor: 1500, expiresAt: "2026-11-19T08:00:00.000Z" },
};

export function summaryWith(overrides: Partial<HomeSummary> = {}): HomeSummary {
  return {
    serverTime: "2026-11-02T04:00:00.000Z",
    tile: "missions",
    missions: null,
    activeOrder: null,
    activeOrderCount: 0,
    testerVoucher: null,
    bugReport: { rewardAvailable: false, amountMinor: 1500 },
    ...overrides,
  };
}

export function setUpTester(foundingTester: FoundingTester) {
  useCart.getState().reset();
  useFoundingTester.setState({ openSurveys: [] } as never);
  useSession.setState({
    user: { id: "u1", email: "client@gridgo.local", name: "Rina Cruz", role: "client", foundingTester },
  } as never);
}
