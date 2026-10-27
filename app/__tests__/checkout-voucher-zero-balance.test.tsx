import { fireEvent, screen, waitFor } from "@testing-library/react-native";

import CheckoutScreen from "@/app/checkout";
import { placedReceiptFor } from "@/lib/receipt";
import { agreeArtworkRights } from "@/test/legalGate";
import { renderInSafeArea } from "@/test/checkoutVoucherHarness";
import { holdVoucherCart, placed, zeroNowBalanceLaterCart } from "@/test/voucherPlaceHarness";

/**
 * A legacy 75/25 order whose launch voucher covers the 75% due now: nothing
 * goes at checkout, and the 25% is still asked for before delivery. Branching
 * on the total alone would have asked for a transfer here. One press, so its
 * own file.
 */

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), navigate: jest.fn(), dismissTo: jest.fn(), back: jest.fn() }),
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
    setCartFulfilment: jest.fn(),
    listVouchers: jest.fn(),
    checkoutCart: jest.fn(),
    recordFunnel: jest.fn(),
  };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require("@/lib/api");

it("sends nothing now and still says the balance is owed before delivery", async () => {
  agreeArtworkRights("cart:cart_1");
  holdVoucherCart(api, zeroNowBalanceLaterCart());
  api.checkoutCart.mockResolvedValue(
    placed({ downpaymentPercent: 75, balanceMinor: 1700 }, { downpaymentPercent: 75, balanceMinor: 1700 }),
  );

  await renderInSafeArea(<CheckoutScreen />);
  await screen.findByText("Nothing to pay now");
  expect(screen.getByText(/GRIDGO asks for the rest by QR before delivery/)).toBeTruthy();
  expect(screen.getByText("Before delivery (25%)")).toBeTruthy();
  expect(screen.queryByLabelText("Payment reference")).toBeNull();

  await fireEvent.press(screen.getByLabelText("Place this order"));

  await waitFor(() =>
    expect(api.checkoutCart).toHaveBeenCalledWith("cart_1", null, expect.objectContaining({ accepted: true }), null),
  );
  const slip = placedReceiptFor("ord_1");
  expect(slip?.paymentStatus).toBe("voucher");
  expect(slip?.paidInFull).toBe(false);
});
