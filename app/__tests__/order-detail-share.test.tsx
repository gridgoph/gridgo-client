import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react-native";

import OrderDetailScreen from "@/app/order/[id]";
import { useOrderShare } from "@/store/orderShare";
import { useSurvey } from "@/store/survey";
import { refundOrder } from "@/test/refundFixtures";
import { renderScreen } from "@/test/renderScreen";
import { orderShare, shareRead } from "@/test/shareFixtures";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn(), canGoBack: () => true }),
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

const ORDER = "ord_refund_1";
const REPEAT = { showAfterSurvey: false, firstShownAt: "t", dismissedAt: "t", showFromOrder: true };

afterEach(async () => {
  await cleanup();
});

beforeEach(() => {
  jest.clearAllMocks();
  useSurvey.getState().reset();
  useOrderShare.getState().reset();
  api.listOrderRefunds.mockResolvedValue([]);
  api.getOrder.mockResolvedValue(refundOrder({ state: "completed", rated: true, timeline: [] }));
});

it("puts a small Share button on a delivered order", async () => {
  api.getOrderShare.mockResolvedValue(shareRead(orderShare({}, { showAfterSurvey: false, closedAt: "t" })));
  await renderScreen(<OrderDetailScreen />);

  expect(await screen.findByRole("button", { name: "Share this order as a story" })).toBeTruthy();
  expect(api.getOrderShare).toHaveBeenCalledWith(ORDER);
  // A closed card stays closed: the button is the way to share now.
  expect(mockPush).not.toHaveBeenCalled();
});

it("offers no Share button while GRIDGO says the order cannot be shared", async () => {
  api.getOrderShare.mockResolvedValue(shareRead(orderShare({ available: false }, { showAfterSurvey: false })));
  await renderScreen(<OrderDetailScreen />);

  expect(await screen.findByText("Grand opening flyers")).toBeTruthy();
  await waitFor(() => expect(api.getOrderShare).toHaveBeenCalled());
  expect(screen.queryByRole("button", { name: "Share this order as a story" })).toBeNull();
});

it("never reads share data for a job still in progress", async () => {
  api.getOrder.mockResolvedValue(refundOrder({ state: "production", timeline: [] }));
  await renderScreen(<OrderDetailScreen />);

  expect(await screen.findByText("Grand opening flyers")).toBeTruthy();
  expect(api.getOrderShare).not.toHaveBeenCalled();
});

it("shows the card once more from the order after Maybe later", async () => {
  api.getOrderShare.mockResolvedValue(shareRead(orderShare({}, REPEAT)));
  await renderScreen(<OrderDetailScreen />);

  await waitFor(() =>
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/order/share", params: { orderId: ORDER, presentation: "order_repeat" } }),
  );
  expect(mockPush).toHaveBeenCalledTimes(1);
});

it("waits for a later visit when the card was put off in this session", async () => {
  useOrderShare.setState({ putOff: { [ORDER]: true } });
  api.getOrderShare.mockResolvedValue(shareRead(orderShare({}, REPEAT)));
  await renderScreen(<OrderDetailScreen />);

  expect(await screen.findByRole("button", { name: "Share this order as a story" })).toBeTruthy();
  expect(mockPush).not.toHaveBeenCalled();
});

it("never again once the repeat has been shown", async () => {
  api.getOrderShare.mockResolvedValue(
    shareRead(orderShare({}, { ...REPEAT, repeatShownAt: "t", showFromOrder: false })),
  );
  await renderScreen(<OrderDetailScreen />);

  expect(await screen.findByRole("button", { name: "Share this order as a story" })).toBeTruthy();
  expect(mockPush).not.toHaveBeenCalled();
});

/* The one press in this file, last (AGENTS.md, "Running and testing"). */
it("opens the same share flow from the Share button, without touching the card", async () => {
  api.getOrderShare.mockResolvedValue(shareRead(orderShare({}, { showAfterSurvey: false, closedAt: "t" })));
  await renderScreen(<OrderDetailScreen />);

  fireEvent.press(await screen.findByRole("button", { name: "Share this order as a story" }));

  expect(mockPush).toHaveBeenCalledWith({ pathname: "/order/share", params: { orderId: ORDER, presentation: "manual" } });
});
