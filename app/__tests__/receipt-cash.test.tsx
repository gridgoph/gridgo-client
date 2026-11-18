import { screen } from "@testing-library/react-native";
import OrderReceiptScreen from "@/app/order/receipt";
import * as api from "@/lib/api";
import { placed } from "@/test/voucherPlaceHarness";
import { CHECKOUT_SETTINGS, renderInSafeArea } from "@/test/checkoutFixtures";
jest.mock("expo-router", () => ({
  useNavigation: () => ({ addListener: () => () => undefined }),
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn(), dismissTo: jest.fn() }), useLocalSearchParams: () => ({ orderId: "ord_1" }),
  useFocusEffect: (effect: () => void) => { const { useEffect } = jest.requireActual("react"); useEffect(effect, [effect]); }, Stack: { Screen: () => null },
}));
jest.mock("expo-router/react-navigation", () => ({ usePreventRemove: jest.fn() }));
jest.mock("@/lib/api", () => ({ ...jest.requireActual("@/lib/api"), getInvoice: jest.fn(), getOrder: jest.fn(), getSettings: jest.fn() }));
it.each([
  ["due", "Cash on delivery · not collected yet"],
  ["collected", "Paid in cash on delivery"],
  ["no_show_repaid", "Cash order · repaid online"],
])("draws the ordinary cash receipt for %s without asking for a QR receipt", async (status, line) => {
  jest.mocked(api.getInvoice).mockResolvedValue({ ...placed({}, { method: "cash" }).invoice, clientItemSubtotalMinor: 4400, totalMinor: 6900 });
  jest.mocked(api.getOrder).mockResolvedValue({ id: "ord_1", state: "needs_qa", cash: { method: "cash", status, version: 2 }, payments: {} } as api.Order);
  jest.mocked(api.getSettings).mockResolvedValue(CHECKOUT_SETTINGS);
  await renderInSafeArea(<OrderReceiptScreen />);
  await screen.findByText(line);
  expect(screen.queryByText("Waiting on your QR receipt")).toBeNull();
});
