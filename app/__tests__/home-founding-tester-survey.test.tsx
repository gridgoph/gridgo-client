import { fireEvent, render, screen } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import HomeScreen from "@/app/(tabs)/home";
import type { FoundingTester } from "@/lib/api";
import { useCart } from "@/store/cart";
import { useRequestDraft } from "@/store/requestDraft";
import { useSession } from "@/store/session";
import { EARNED } from "@/test/foundingTesterHarness";
import { refundOrder } from "@/test/refundFixtures";

/*
  The survey step on Home leads to a survey GRIDGO says is open
  (`GET /me/surveys`), never one picked by order state or age. One test: Home
  re-reads the account on focus (AGENTS.md § "Running and testing").
*/

jest.mock("expo-router", () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
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
    getProductCategories: jest.fn(async () => []),
    getCart: jest.fn(async () => null),
    getAccount: jest.fn(),
    acknowledgeTesterTracking: jest.fn(),
    listOpenSurveys: jest.fn(),
  };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require("@/lib/api");

function signedIn(foundingTester?: FoundingTester) {
  const user = {
    id: "user_1",
    name: "Rina Cruz",
    email: "rina@example.com",
    role: "client" as const,
    accountType: "individual" as const,
    ...(foundingTester ? { foundingTester } : {}),
  };
  api.getAccount.mockReset();
  api.getAccount.mockResolvedValue(user);
  useCart.getState().reset();
  useRequestDraft.getState().reset();
  useSession.setState({ user } as never);
}

function renderInSafeArea(ui: ReactElement) {
  return render(ui, {
    wrapper: ({ children }) => (
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 390, height: 844 },
          insets: { top: 47, left: 0, right: 0, bottom: 34 },
        }}
      >
        {children}
      </SafeAreaProvider>
    ),
  });
}

it("opens the survey GRIDGO lists as open, not the newest handed-over order (review finding 6)", async () => {
  // ord_newer is newer and handed over, but its survey is gone; ord_open's is open.
  api.listOrders.mockResolvedValueOnce([
    refundOrder({ id: "ord_newer", state: "completed", createdAt: "2026-10-10T08:00:00+08:00" }),
    refundOrder({ id: "ord_open", state: "issue_window_open", createdAt: "2026-09-01T08:00:00+08:00" }),
  ]);
  api.listOpenSurveys.mockResolvedValue({
    serverTime: "2026-10-21T08:00:00.000Z",
    surveys: [
      {
        orderId: "ord_open",
        status: "open",
        fulfillmentKind: "delivery",
        openedAt: "2026-10-20T08:00:00.000Z",
        expiresAt: "2026-10-27T08:00:00.000Z",
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
    ],
  });
  signedIn({
    ...EARNED,
    label: null,
    awardedAt: null,
    reward: null,
    rewardStatus: "pending",
    completedCount: 4,
    missions: { added: true, placed: true, tracked: true, received: true, rated: false },
  });
  await renderInSafeArea(<HomeScreen />);

  const step = await screen.findByRole("button", { name: "Answer the survey. Step 5 of 5, Complete the survey, next step" });
  expect(api.listOpenSurveys).toHaveBeenCalled();
  fireEvent.press(step);
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  expect(require("expo-router").router.push).toHaveBeenCalledWith("/order/survey?orderId=ord_open");
});
