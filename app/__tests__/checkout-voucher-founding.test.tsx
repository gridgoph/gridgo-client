import { cleanup, screen } from "@testing-library/react-native";

import CheckoutScreen from "@/app/checkout";
import { useCart } from "@/store/cart";
import { useCheckoutPayment } from "@/store/checkoutPayment";
import { useVouchers } from "@/store/vouchers";
import { renderInSafeArea, VOUCHER_SETTINGS, voucherCart } from "@/test/checkoutVoucherHarness";
import { foundingVoucher } from "@/test/promotionFixtures";
import { withVoucher } from "@/test/voucherFixtures";

/**
 * A Founding 30 voucher at checkout (gridgo-api#315): one discount line over
 * the whole order, printing and delivery together, drawn from GRIDGO's quote
 * and never worked out here. ₱200 on a ₱69 order takes it to ₱0.00, not below.
 */

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
  };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require("@/lib/api");

// GRIDGO caps the discount at the order: ₱44 printing + ₱25 delivery.
const applied = withVoucher(voucherCart(), foundingVoucher, 6900);

afterEach(async () => {
  await cleanup();
});

it("draws one Founding 30 line for the whole order and a ₱0.00 total", async () => {
  useCheckoutPayment.getState().reset();
  useVouchers.getState().reset();
  api.getSettings.mockResolvedValue({ ...VOUCHER_SETTINGS, serviceFeeVisibleToClient: false });
  api.getCart.mockResolvedValue(applied);
  api.listAddresses.mockResolvedValue([]);
  api.listVouchers.mockResolvedValue({ serverTime: new Date().toISOString(), vouchers: [foundingVoucher] });
  useCart.setState({ cartId: "cart_1", cart: applied, loading: false, busy: false, error: null, hydrated: true });

  await renderInSafeArea(<CheckoutScreen />);
  await screen.findByText("WHAT GRIDGO IS PRINTING");

  expect(screen.getByLabelText("Founding 30, minus ₱69.00")).toBeTruthy();
  expect(screen.getAllByTestId("voucher-discount-row")).toHaveLength(1);
  // Printing and delivery stay gross; the line explains the total.
  expect(screen.getAllByText("₱44.00").length).toBeGreaterThan(0);
  expect(screen.getAllByText("₱0.00").length).toBeGreaterThan(0);
  expect(screen.getByText("−₱69.00 on this order")).toBeTruthy();
  expect(screen.getByText(/₱69\.00 of this ₱200\.00 voucher applies here, because that is the whole order/)).toBeTruthy();
  expect(
    screen.getByText(
      "This voucher comes off your whole order, printing and delivery together, as one discount. The total never goes below ₱0.00.",
    ),
  ).toBeTruthy();
});
