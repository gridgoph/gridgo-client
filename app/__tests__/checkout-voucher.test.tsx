import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react-native";

import CheckoutScreen from "@/app/checkout";
import { useCart } from "@/store/cart";
import { useCheckoutPayment } from "@/store/checkoutPayment";
import { useVouchers } from "@/store/vouchers";
import { renderInSafeArea, VOUCHER_SETTINGS, voucherCart } from "@/test/checkoutVoucherHarness";
import { expectNoServiceFee } from "@/test/serviceFeeSwitch";
import { voucher, withVoucher } from "@/test/voucherFixtures";

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

const tester = voucher();
const applied = withVoucher(voucherCart(), tester);

afterEach(async () => {
  await cleanup();
});

beforeEach(() => {
  useCheckoutPayment.getState().reset();
  useVouchers.getState().reset();
  api.getSettings.mockResolvedValue({ ...VOUCHER_SETTINGS, serviceFeeVisibleToClient: false });
  api.getCart.mockResolvedValue(applied);
  api.listAddresses.mockResolvedValue([]);
  api.listVouchers.mockResolvedValue({ serverTime: new Date().toISOString(), vouchers: [{ ...tester, expiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString() }] });
  api.removeCartVoucher.mockResolvedValue({ cart: voucherCart(), serverTime: new Date().toISOString() });
  useCart.setState({ cartId: "cart_1", cart: applied, loading: false, busy: false, error: null, hydrated: true });
});

/* One press per file, and it goes last (AGENTS.md, "Running and testing"). */
describe("Checkout with a voucher GRIDGO applied", () => {
  it("draws Voucher −₱15.00 and the lower total, with no sign of the fee while the switch is off", async () => {
    await renderInSafeArea(<CheckoutScreen />);
    await screen.findByText("WHAT GRIDGO IS PRINTING");

    // ₱44 printing + ₱25 delivery − ₱15 voucher = ₱54, paid in full.
    expect(screen.getByLabelText("Voucher, minus ₱15.00")).toBeTruthy();
    expect(screen.getByText("Printing")).toBeTruthy();
    expect(screen.getAllByText("₱44.00").length).toBeGreaterThan(0);
    expect(screen.getAllByText("₱54.00").length).toBeGreaterThan(1);
    expect(screen.getByText("Soft-launch tester thanks")).toBeTruthy();
    expect(screen.getByText("−₱15.00 on this order")).toBeTruthy();
    expect(screen.getByText(/Applied automatically/)).toBeTruthy();
    expect(screen.getByLabelText("Remove the voucher from this order")).toBeTruthy();
    expectNoServiceFee(screen);
  });

  it("takes it off through GRIDGO and forgets it for this basket", async () => {
    await renderInSafeArea(<CheckoutScreen />);
    await screen.findByText("−₱15.00 on this order");

    await fireEvent.press(screen.getByLabelText("Remove the voucher from this order"));

    await waitFor(() => expect(api.removeCartVoucher).toHaveBeenCalledWith("cart_1"));
    await waitFor(() => expect(useVouchers.getState().removedCarts).toEqual(["cart_1"]));
    expect(useCart.getState().cart?.clientQuote?.voucherDiscountMinor).toBeUndefined();
  });
});
