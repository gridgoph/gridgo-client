import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react-native";

import CheckoutScreen from "@/app/checkout";
import { useCart } from "@/store/cart";
import { useCheckoutPayment } from "@/store/checkoutPayment";
import { useVouchers } from "@/store/vouchers";
import { renderInSafeArea, VOUCHER_SETTINGS, voucherCart } from "@/test/checkoutVoucherHarness";
import { voucher } from "@/test/voucherFixtures";

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), navigate: jest.fn(), back: jest.fn() }),
  useFocusEffect: (effect: () => void) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useEffect } = require("react");
    useEffect(effect, [effect]);
  },
}));

jest.mock("@/lib/api", () => {
  const actual = jest.requireActual("@/lib/api");
  return {
    ...actual,
    getSettings: jest.fn(),
    getCart: jest.fn(),
    listAddresses: jest.fn(),
    setCartDropoffs: jest.fn(),
    listVouchers: jest.fn(),
    applyCartVoucher: jest.fn(),
    removeCartVoucher: jest.fn(),
  };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require("@/lib/api");

const week = () => new Date(Date.now() + 7 * 86_400_000).toISOString();
const first = voucher({ id: "vch_a", name: "Soft-launch tester thanks" });
const second = voucher({ id: "vch_b", name: "Weekend bonus" });

afterEach(async () => {
  await cleanup();
});

beforeEach(() => {
  useCheckoutPayment.getState().reset();
  useVouchers.getState().reset();
  api.getSettings.mockResolvedValue(VOUCHER_SETTINGS);
  api.getCart.mockResolvedValue(voucherCart());
  api.listAddresses.mockResolvedValue([]);
  api.listVouchers.mockResolvedValue({
    serverTime: new Date().toISOString(),
    vouchers: [{ ...first, expiresAt: week() }, { ...second, expiresAt: week() }],
  });
  api.applyCartVoucher.mockResolvedValue({ cart: voucherCart(), serverTime: new Date().toISOString() });
  useCart.setState({ cartId: "cart_1", cart: voucherCart(), loading: false, busy: false, error: null, hydrated: true });
});

/* GRIDGO does not pick between two vouchers; the client does. One press, last. */
describe("Checkout with two vouchers that fit", () => {
  it("asks which one and applies the one picked", async () => {
    await renderInSafeArea(<CheckoutScreen />);
    expect(await screen.findByText(/You have 2 vouchers\. Choose the one for this order/)).toBeTruthy();
    expect(screen.queryByTestId("voucher-discount-row")).toBeNull();

    await fireEvent.press(screen.getAllByLabelText("Apply: ₱15.00 voucher")[1]);

    await waitFor(() => expect(api.applyCartVoucher).toHaveBeenCalledWith("cart_1", { voucherId: "vch_b" }));
  });
});
