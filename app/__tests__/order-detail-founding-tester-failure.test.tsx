import { cleanup, screen, waitFor } from "@testing-library/react-native";

import OrderDetailScreen from "@/app/order/[id]";
import type { FoundingTester, Order } from "@/lib/api";
import { resetFoundingTesterCallsForTests } from "@/store/foundingTester";
import { useSession } from "@/store/session";
import { useSurvey } from "@/store/survey";
import { refundOrder } from "@/test/refundFixtures";
import { renderScreen } from "@/test/renderScreen";

/*
  An order cancelled after a shop or GRIDGO failure can still count for the
  Founding Tester path (gridgo-api VOUCHERS_API.md § Founding Tester
  missions): GRIDGO counts it as placed and received, and the client still
  tracks it and answers its survey. The client cannot see the failure, so it
  sends the tracking and reads the survey, and GRIDGO's answers decide.
*/

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true }),
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({ id: "ord_refund_1" }),
  useFocusEffect: (effect: () => void) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useEffect } = require("react");
    useEffect(effect, [effect]);
  },
}));
jest.mock("expo-document-picker", () => ({ getDocumentAsync: jest.fn() }));
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock("@/lib/api", () => require("@/test/orderScreenMocks").orderScreenApiMock());

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require("@/lib/api");

const PATH: FoundingTester = {
  eligible: true,
  label: null,
  awardedAt: null,
  missions: { added: true, placed: true, tracked: false, received: true, rated: false },
  completedCount: 3,
  rewardStatus: "pending",
  reward: null,
};

afterEach(async () => {
  await cleanup();
});

it("tracks a cancelled failure order and shows the survey GRIDGO opened for it (review finding 1)", async () => {
  resetFoundingTesterCallsForTests();
  useSurvey.getState().reset();
  useSession.setState({
    user: { id: "user_client", email: "c@example.test", name: "Client", role: "client", foundingTester: PATH },
  } as never);
  api.listOrderRefunds.mockResolvedValue([]);
  api.acknowledgeTesterTracking.mockReset();
  api.acknowledgeTesterTracking.mockResolvedValue({
    serverTime: new Date().toISOString(),
    foundingTester: { ...PATH, missions: { ...PATH.missions, tracked: true }, completedCount: 4 },
    invites: { code: null, link: null, invited: 0, joined: 0, completed: 0 },
  });
  // Cancelled, and its payment never confirmed.
  api.getOrder.mockResolvedValue(
    refundOrder({
      state: "cancelled",
      timeline: [],
      payments: { initial: { amountMinor: 1000, method: "qr_manual", status: "pending_confirmation", reference: "X", submittedAt: null, confirmedAt: null } },
    } as Partial<Order>),
  );
  const now = Date.now();
  api.getOrderSurvey.mockResolvedValue({
    serverTime: new Date(now).toISOString(),
    survey: {
      orderId: "ord_refund_1",
      status: "open",
      fulfillmentKind: "delivery",
      openedAt: new Date(now - 3_600_000).toISOString(),
      expiresAt: new Date(now + 6 * 86_400_000).toISOString(),
      dismissedAt: null,
      submittedAt: null,
      answers: null,
      needsFollowUp: false,
      rewardStatus: null,
      reward: null,
      rewardEligible: false,
      nextRewardAt: null,
      reportProblem: null,
    },
  });
  await renderScreen(<OrderDetailScreen />);

  expect(await screen.findByText("How did your order go?")).toBeTruthy();
  expect(api.getOrderSurvey).toHaveBeenCalledWith("ord_refund_1");
  await waitFor(() => expect(api.acknowledgeTesterTracking).toHaveBeenCalledWith("ord_refund_1", expect.stringMatching(/^[0-9a-f-]{36}$/)));
});
