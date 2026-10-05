import { fireEvent, screen, waitFor } from "@testing-library/react-native";

import OrderDetailScreen from "@/app/order/[id]";
import { refundOrder } from "@/test/refundFixtures";
import { renderScreen } from "@/test/renderScreen";
import { shopRecovery } from "@/test/shopChangeFixtures";

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

beforeEach(() => {
  api.listOrderRefunds.mockResolvedValue([]);
});

it("makes the refund the one way forward when no shop can take it, and opens it once requested", async () => {
  api.getOrder.mockResolvedValue(
    refundOrder({ state: "production", shopRecovery: shopRecovery({ replacement: null, canAccept: false }) }),
  );
  api.refundShopRecovery.mockResolvedValue(shopRecovery({ status: "refund_requested", refundRequestId: "refund_1" }));
  await renderScreen(<OrderDetailScreen />);

  expect(await screen.findByText(/No other shop can print it exactly as ordered/)).toBeTruthy();
  expect(screen.queryByText("Accept the new shop")).toBeNull();
  fireEvent.press(screen.getByText("Get a full refund"));
  expect(await screen.findByText("Cancel this order for a full refund?")).toBeTruthy();
  fireEvent.press(screen.getAllByText("Get a full refund").at(-1)!);

  await waitFor(() =>
    expect(api.refundShopRecovery).toHaveBeenCalledWith("ord_refund_1", "shop_event_1", expect.any(String)),
  );
  await waitFor(() =>
    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/order/refund",
      params: { orderId: "ord_refund_1", refundId: "refund_1" },
    }),
  );
});
