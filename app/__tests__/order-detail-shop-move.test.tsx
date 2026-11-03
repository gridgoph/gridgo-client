import { screen } from "@testing-library/react-native";

import OrderDetailScreen from "@/app/order/[id]";
import { refund, refundOrder } from "@/test/refundFixtures";
import { renderScreen } from "@/test/renderScreen";
import { aboveCapWithAlternatives, awaitingPaymentRecovery, topUpChange } from "@/test/shopChangeFixtures";

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
  gridgo-api#225 on the order screen: the shop-move decision is the action
  zone, ahead of the shop's own change requests. Render-only; the presses are
  in components/__tests__/ShopRecoveryCard-*.test.tsx.
*/
it("makes the above-cover choice the order's one decision, with the job paused", async () => {
  api.getOrder.mockResolvedValue(refundOrder({ state: "supplier_assigned", shopRecovery: aboveCapWithAlternatives() }));
  await renderScreen(<OrderDetailScreen />);

  expect(await screen.findByText("Your shop could not take this order")).toBeTruthy();
  expect(screen.getByText("Pay ₱150.00 more and accept")).toBeTruthy();
  expect(screen.getByText("Or pick another shop")).toBeTruthy();
  expect(screen.getByText("Get a full refund instead")).toBeTruthy();
  expect(screen.getByText("Paused")).toBeTruthy();
  expect(screen.queryByText("Request a refund")).toBeNull();
});

it("returns to the payment step after a refund from it was withdrawn, never as the shop's change", async () => {
  api.getOrder.mockResolvedValue(
    refundOrder({
      state: "supplier_assigned",
      shopRecovery: awaitingPaymentRecovery(),
      changeRequests: [topUpChange()],
    }),
  );
  api.listOrderRefunds.mockResolvedValue([refund({ status: "withdrawn" })]);
  await renderScreen(<OrderDetailScreen />);

  expect(await screen.findByText("Pay ₱150.00 to move to the new shop")).toBeTruthy();
  expect(screen.getByText("Get a full refund instead")).toBeTruthy();
  expect(screen.queryByText("Pay ₱150.00 for your change")).toBeNull();
  expect(screen.queryByText("Decline and keep my order as placed")).toBeNull();
});
