import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import CheckoutScreen from "@/app/checkout";
import * as api from "@/lib/api";
import { useSession } from "@/store/session";
import { useCheckoutPayment } from "@/store/checkoutPayment";
import { checkoutCart, CHECKOUT_SETTINGS, renderInSafeArea } from "@/test/checkoutFixtures";
import { agreeArtworkRights } from "@/test/legalGate";
import { holdVoucherCart, placed } from "@/test/voucherPlaceHarness";

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), navigate: jest.fn(), dismissTo: jest.fn(), back: jest.fn() }),
  useFocusEffect: (effect: () => void) => {
    const { useEffect } = jest.requireActual("react");
    useEffect(effect, [effect]);
  },
}));
jest.mock("@/lib/api", () => ({ ...jest.requireActual("@/lib/api"), getSettings: jest.fn(), getCart: jest.fn(), listAddresses: jest.fn(), listOrders: jest.fn(), listVouchers: jest.fn(), checkoutCart: jest.fn(), recordFunnel: jest.fn() }));
jest.mock("@/hooks/usePaymentProof", () => ({ usePaymentProof: () => ({ state: { phase: "empty", fileId: null }, ocr: { status: "reading" }, pick: jest.fn(), reset: jest.fn() }) }));

it("places an eligible cash order without a QR proof, reference or OCR wait", async () => {
  const cart = checkoutCart();
  holdVoucherCart(api as unknown as Parameters<typeof holdVoucherCart>[0], cart);
  jest.mocked(api.getSettings).mockResolvedValue({ ...CHECKOUT_SETTINGS, cash: { enabled: true, limitMinor: 150000 } });
  jest.mocked(api.listOrders).mockResolvedValue([]);
  useSession.setState({ user: { id: "client", role: "client", email: "", name: "Client", accountType: "individual" } });
  useCheckoutPayment.setState({ cartId: cart.id, method: "cash" });
  agreeArtworkRights(`cart:${cart.id}`);
  jest.mocked(api.checkoutCart).mockResolvedValue(placed({ method: "cash", downpaymentStatus: "not_submitted" }, { method: "cash" }));
  await renderInSafeArea(<CheckoutScreen />);
  await screen.findByText("Have ₱69.00 ready");
  expect(screen.queryByLabelText("Payment reference")).toBeNull();
  expect(screen.queryByText("Only method")).toBeNull();
  expect(screen.queryByText(/pay by QR to place it/)).toBeNull();
  expect(screen.queryByText(/and your payment reference/)).toBeNull();
  await fireEvent.press(screen.getByLabelText("Place this order"));
  await waitFor(() => expect(api.checkoutCart).toHaveBeenCalledWith("cart_1", { method: "cash" }, expect.objectContaining({ accepted: true }), null));
});
