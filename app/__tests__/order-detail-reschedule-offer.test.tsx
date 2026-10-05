import { fireEvent, screen, waitFor } from "@testing-library/react-native";

import OrderDetailScreen from "@/app/order/[id]";
import { readyByDate } from "@/lib/readyTime";
import { refundOrder } from "@/test/refundFixtures";
import { renderScreen } from "@/test/renderScreen";
import { rescheduleRequest } from "@/test/shopChangeFixtures";

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

const iso = (offset: number) => new Date(Date.now() + offset).toISOString();

beforeEach(() => {
  api.listOrderRefunds.mockResolvedValue([]);
});

const offered = () =>
  rescheduleRequest({
    status: "declined",
    resolution: "rematch_offered",
    workHeld: true,
    canRequestRefund: true,
    rematch: {
      id: "rematch_1",
      promiseBy: "2026-10-08T17:00:00+08:00",
      expiresAt: iso(12 * 60_000),
      sameProductAndSpecs: true,
      priceUnchanged: true,
    },
  });

it("offers another shop after a decline, with the refund as the other answer", async () => {
  api.getOrder.mockResolvedValue(refundOrder({ rescheduleRequest: offered() }));
  await renderScreen(<OrderDetailScreen />);

  expect(await screen.findByText("Another shop can print it")).toBeTruthy();
  expect(screen.getByText(readyByDate("2026-10-08T17:00:00+08:00")!)).toBeTruthy();
  expect(screen.getByText(/12 minutes left/)).toBeTruthy();
  expect(screen.getByText("Get a full refund instead")).toBeTruthy();
});

it("asks to check again once the offer has run out", async () => {
  const stale = offered();
  stale.rematch = { ...stale.rematch!, expiresAt: iso(-60_000) };
  api.getOrder.mockResolvedValue(refundOrder({ rescheduleRequest: stale }));
  await renderScreen(<OrderDetailScreen />);

  expect(await screen.findByText("That offer has run out")).toBeTruthy();
  expect(screen.getByText("Check again")).toBeTruthy();
  expect(screen.queryByText("Accept the new shop")).toBeNull();
});

it("takes the shop on offer by its offer id", async () => {
  api.getOrder.mockResolvedValue(refundOrder({ rescheduleRequest: offered() }));
  api.rematchReschedule.mockResolvedValue(rescheduleRequest({ status: "declined", resolution: "rematched" }));
  await renderScreen(<OrderDetailScreen />);

  fireEvent.press(await screen.findByText("Accept the new shop"));
  await waitFor(() =>
    expect(api.rematchReschedule).toHaveBeenCalledWith("ord_refund_1", {
      requestId: "resched_1",
      action: "accept",
      offerId: "rematch_1",
    }),
  );
});
