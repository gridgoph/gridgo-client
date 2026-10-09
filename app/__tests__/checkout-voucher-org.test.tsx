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

jest.mock("@/store/organization", () => ({
  ...jest.requireActual("@/store/organization"),
  useIsApprovedOrganization: () => true,
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

const cart = voucherCart();
const organizationCart = {
  ...cart,
  clientQuote: {
    ...cart.clientQuote!,
    organizationDiscountMinor: 2000,
    discountKind: "organization" as const,
    voucher: null,
    voucherDiscountMinor: 0,
    totalMinor: 4900,
    downpaymentMinor: 4900,
  },
};

afterEach(async () => {
  await cleanup();
});

beforeEach(() => {
  useCheckoutPayment.getState().reset();
  useVouchers.getState().reset();
  api.getSettings.mockResolvedValue(VOUCHER_SETTINGS);
  api.getCart.mockResolvedValue(organizationCart);
  api.listAddresses.mockResolvedValue([]);
  api.listVouchers.mockResolvedValue({
    serverTime: new Date().toISOString(),
    vouchers: [{ ...voucher(), expiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString() }],
  });
  useCart.setState({ cartId: "cart_1", cart: organizationCart, loading: false, busy: false, error: null, hydrated: true });
});

/* A voucher and the organization discount never stack (gridgo-api#204). */
describe("Checkout for an organization whose discount is larger", () => {
  it("keeps the organization discount, says why, and draws no voucher line", async () => {
    await renderInSafeArea(<CheckoutScreen />);

    expect(await screen.findByText("Your organization discount applies")).toBeTruthy();
    expect(screen.getByText(/saves as much as or more than your ₱15\.00 voucher on this\s+order, and the two never combine/)).toBeTruthy();
    expect(screen.getByLabelText("Organization discount, minus ₱20.00")).toBeTruthy();
    expect(screen.queryByTestId("voucher-discount-row")).toBeNull();
    expect(screen.queryByLabelText(/^Apply:/)).toBeNull();
  });
});
