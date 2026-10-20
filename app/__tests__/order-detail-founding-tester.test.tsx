import { cleanup, screen, waitFor } from "@testing-library/react-native";

import OrderDetailScreen from "@/app/order/[id]";
import type { FoundingTester } from "@/lib/api";
import { resetFoundingTesterCallsForTests } from "@/store/foundingTester";
import { useSession } from "@/store/session";
import { refundOrder } from "@/test/refundFixtures";
import { renderScreen } from "@/test/renderScreen";

/*
  The order screen is where a client tracks a job, so opening it is the
  Founding Tester "Track your order" step (gridgo-api FOUNDING_TESTER_API.md).
  Home merely showing the order never sends it: home-founding-tester.test.tsx.
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
  missions: { added: true, placed: true, tracked: false, received: false, rated: false },
  completedCount: 2,
  rewardStatus: "pending",
  reward: null,
};

function signedIn(foundingTester: FoundingTester) {
  useSession.setState({
    user: { id: "user_client", email: "c@example.test", name: "Client", role: "client", foundingTester },
  } as never);
}

afterEach(async () => {
  await cleanup();
});

beforeEach(() => {
  resetFoundingTesterCallsForTests();
  api.listOrderRefunds.mockResolvedValue([]);
  api.acknowledgeTesterTracking.mockReset();
  api.acknowledgeTesterTracking.mockResolvedValue({
    serverTime: new Date().toISOString(),
    foundingTester: { ...PATH, missions: { ...PATH.missions, tracked: true }, completedCount: 3 },
    invites: { code: null, link: null, invited: 0, joined: 0, completed: 0 },
  });
});

it("tells GRIDGO the client tracked their paid order when its screen opens", async () => {
  signedIn(PATH);
  api.getOrder.mockResolvedValue(refundOrder({ state: "production", timeline: [] }));
  await renderScreen(<OrderDetailScreen />);

  expect(await screen.findByText("Grand opening flyers")).toBeTruthy();
  await waitFor(() => expect(api.acknowledgeTesterTracking).toHaveBeenCalledTimes(1));
  expect(api.acknowledgeTesterTracking).toHaveBeenCalledWith("ord_refund_1", expect.stringMatching(/^[0-9a-f-]{36}$/));
  await waitFor(() => expect(useSession.getState().user?.foundingTester?.missions.tracked).toBe(true));
});

it("sends nothing once the step is done", async () => {
  signedIn({ ...PATH, missions: { ...PATH.missions, tracked: true } });
  api.getOrder.mockResolvedValue(refundOrder({ state: "production", timeline: [] }));
  await renderScreen(<OrderDetailScreen />);

  expect(await screen.findByText("Grand opening flyers")).toBeTruthy();
  expect(api.acknowledgeTesterTracking).not.toHaveBeenCalled();
});
