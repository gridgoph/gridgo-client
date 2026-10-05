import { fireEvent, screen, waitFor } from "@testing-library/react-native";

import OrderDetailScreen from "@/app/order/[id]";
import { readyByDate } from "@/lib/readyTime";
import { refundOrder } from "@/test/refundFixtures";
import { renderScreen } from "@/test/renderScreen";
import { shopRecovery } from "@/test/shopChangeFixtures";

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

beforeEach(() => {
  api.listOrderRefunds.mockResolvedValue([]);
});

/*
  gridgo-supplier#102: the shop on this order could not take it. One press per
  file (see AGENTS.md "Running and testing"), so the press is the last test.
*/
it("offers the new shop with its ready date, beside a full refund, as the one decision", async () => {
  api.getOrder.mockResolvedValue(refundOrder({ state: "supplier_assigned", promiseBy: "2026-10-07T17:00:00+08:00", shopRecovery: shopRecovery() }));
  await renderScreen(<OrderDetailScreen />);

  expect(await screen.findByText("Your shop could not take this order")).toBeTruthy();
  expect(screen.getByText(readyByDate("2026-10-09T17:00:00+08:00")!)).toBeTruthy();
  expect(screen.getByText(readyByDate("2026-10-07T17:00:00+08:00")!)).toBeTruthy();
  expect(screen.getByText("2 days later")).toBeTruthy();
  expect(screen.getByText("Accept the new shop")).toBeTruthy();
  expect(screen.getByText("Get a full refund instead")).toBeTruthy();
  expect(screen.getByText(/All ₱1,150\.00 you paid comes back/)).toBeTruthy();
  // The decision offers its own refund; the generic entry would be a second one.
  expect(screen.queryByText("Request a refund")).toBeNull();
});

it("tells the client Operations will contact them when the case needs a person", async () => {
  api.getOrder.mockResolvedValue(
    refundOrder({ shopRecovery: shopRecovery({ status: "ops_review", replacement: null, canAccept: false }) }),
  );
  await renderScreen(<OrderDetailScreen />);

  expect(await screen.findByText(/Operations will contact you about what happens next/)).toBeTruthy();
  expect(screen.queryByText("Accept the new shop")).toBeNull();
  expect(screen.getByText("Get a full refund")).toBeTruthy();
  expect(screen.getByText(/Prefer not to wait\?/)).toBeTruthy();
  // The order is still "production" on the server, but nothing is printing.
  expect(screen.getByText("Paused")).toBeTruthy();
});

it("accepts the replacement it was shown and reloads the order", async () => {
  api.getOrder.mockResolvedValue(refundOrder({ state: "supplier_assigned", shopRecovery: shopRecovery() }));
  await renderScreen(<OrderDetailScreen />);

  const button = await screen.findByText("Accept the new shop");
  const reads = api.getOrder.mock.calls.length;
  fireEvent.press(button);
  await waitFor(() => expect(api.acceptShopRecovery).toHaveBeenCalledWith("ord_refund_1", "shop_event_1"));
  await waitFor(() => expect(api.getOrder.mock.calls.length).toBeGreaterThan(reads));
});
