import { cleanup, render, screen } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import OrderReceiptScreen from "@/app/order/receipt";
import { combinedInvoice, placedBasket } from "@/test/multiShopFixtures";
import { groupOrder } from "@/test/multiShopOrderScreen";
import { setServiceFeeSwitch } from "@/test/serviceFeeSwitch";

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), dismissTo: jest.fn() }),
  useLocalSearchParams: () => ({ orderId: "ord_b" }),
  useFocusEffect: (effect: () => void) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useEffect } = require("react");
    useEffect(effect, [effect]);
  },
  Stack: { Screen: () => null },
}));

jest.mock("expo-router/react-navigation", () => ({ usePreventRemove: jest.fn() }));

jest.mock("@/lib/api", () => {
  const actual = jest.requireActual("@/lib/api");
  return { ...actual, getInvoice: jest.fn(), getOrder: jest.fn(), getBasket: jest.fn() };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require("@/lib/api");

const wrap = (node: ReactElement) => (
  <SafeAreaProvider
    initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}
  >
    {node}
  </SafeAreaProvider>
);

afterEach(async () => {
  await cleanup();
});

it("opens the one combined receipt from any group, a section per shop, with a cancelled group marked", async () => {
  setServiceFeeSwitch(true);
  api.getInvoice.mockResolvedValue(combinedInvoice());
  api.getOrder.mockResolvedValue(groupOrder({ state: "cancelled" }));
  api.getBasket.mockResolvedValue(placedBasket(["production", "cancelled", "production"]));
  await render(wrap(<OrderReceiptScreen />));

  expect(await screen.findByTestId("receipt-group-A")).toBeTruthy();
  expect(screen.getByTestId("receipt-group-B")).toBeTruthy();
  expect(screen.getByTestId("receipt-group-C")).toBeTruthy();
  expect(await screen.findByText(/^Cancelled after you placed the order/)).toBeTruthy();
  expect(screen.getByText("Delivery · 3 shops")).toBeTruthy();
  expect(screen.getByText("₱817.20")).toBeTruthy();
  // The rate comes from the group's own order, because the receipt withholds it.
  expect(screen.getByText("Service fee · 10%")).toBeTruthy();
  expect(api.getBasket).toHaveBeenCalledWith("bsk_1");
});
