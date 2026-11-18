import { screen } from "@testing-library/react-native";
import CheckoutScreen from "@/app/checkout";
import * as api from "@/lib/api";
import { useSession } from "@/store/session";
import { checkoutCart, CHECKOUT_SETTINGS, renderInSafeArea } from "@/test/checkoutFixtures";
import { holdVoucherCart } from "@/test/voucherPlaceHarness";

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), navigate: jest.fn(), dismissTo: jest.fn(), back: jest.fn() }),
  useFocusEffect: (effect: () => void) => {
    const { useEffect } = jest.requireActual("react");
    useEffect(effect, [effect]);
  },
}));
jest.mock("@/lib/api", () => ({ ...jest.requireActual("@/lib/api"), getSettings: jest.fn(), getCart: jest.fn(), listAddresses: jest.fn(), listOrders: jest.fn(), listVouchers: jest.fn(), checkoutCart: jest.fn(), recordFunnel: jest.fn() }));
jest.mock("@/hooks/usePaymentProof", () => ({ usePaymentProof: () => ({ state: { phase: "empty", fileId: null }, ocr: { status: "reading" }, pick: jest.fn(), reset: jest.fn() }) }));

it("explains an approved no-show bar and keeps cash unavailable", async () => {
  const cart = checkoutCart();
  holdVoucherCart(api as unknown as Parameters<typeof holdVoucherCart>[0], cart);
  jest.mocked(api.getSettings).mockResolvedValue({ ...CHECKOUT_SETTINGS, cash: { enabled: true, limitMinor: 150000 } });
  jest.mocked(api.listOrders).mockResolvedValue([{ cash: { method: "cash", status: "online_repayment_required", version: 2 } } as api.Order]);
  useSession.setState({ user: { id: "client", role: "client", email: "", name: "Client", accountType: "individual" } });
  await renderInSafeArea(<CheckoutScreen />);
  await screen.findByText(/Repay the order and its delivery fare online/);
  expect(screen.queryByRole("radio", { name: "Cash on delivery" })).toBeNull();
  expect(api.checkoutCart).not.toHaveBeenCalled();
});
