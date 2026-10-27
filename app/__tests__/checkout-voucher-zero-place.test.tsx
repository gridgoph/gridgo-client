import { fireEvent, screen, waitFor } from "@testing-library/react-native";

import CheckoutScreen from "@/app/checkout";
import { placedReceiptFor } from "@/lib/receipt";
import { agreeArtworkRights } from "@/test/legalGate";
import { renderInSafeArea } from "@/test/checkoutVoucherHarness";
import { holdVoucherCart, placed, zeroCart } from "@/test/voucherPlaceHarness";

/**
 * A Founding 30 that covers the whole order (gridgo-api#315): GRIDGO settles
 * the first payment with the voucher, so checkout asks for no QR, screenshot
 * or reference and sends no `payment` at all. One press, so its own file.
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

it("places a ₱0.00 order with no transfer, and the slip says the voucher settled it", async () => {
  agreeArtworkRights("cart:cart_1");
  holdVoucherCart(api, zeroCart());
  api.checkoutCart.mockResolvedValue(placed());

  await renderInSafeArea(<CheckoutScreen />);
  await screen.findByText("Nothing to pay now");

  // No QR to scan, no screenshot, no reference: nothing was transferred.
  expect(screen.queryByLabelText("Show the GRIDGO QR to scan")).toBeNull();
  expect(screen.queryByLabelText("Payment reference")).toBeNull();
  expect(screen.getByText(/Your Founding 30 covers the whole order/)).toBeTruthy();

  await fireEvent.press(screen.getByLabelText("Place this order"));

  await waitFor(() =>
    expect(api.checkoutCart).toHaveBeenCalledWith(
      "cart_1",
      null,
      expect.objectContaining({ accepted: true }),
      null,
    ),
  );
  const slip = placedReceiptFor("ord_1");
  expect(slip?.paymentStatus).toBe("voucher");
  expect(slip?.paymentReference).toBeNull();
});
