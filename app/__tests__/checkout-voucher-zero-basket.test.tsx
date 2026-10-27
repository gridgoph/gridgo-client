import { fireEvent, screen, waitFor } from "@testing-library/react-native";

import CheckoutScreen from "@/app/checkout";
import { agreeArtworkRights } from "@/test/legalGate";
import { renderInSafeArea } from "@/test/checkoutVoucherHarness";
import { holdVoucherCart, placed, zeroBasket } from "@/test/voucherPlaceHarness";

/**
 * A basket from two shops whose every peso a launch voucher covers: GRIDGO
 * settles the whole basket at once, so it sends no `payment` either. One
 * press, so its own file.
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
    getCatalogShop: jest.fn(),
    checkoutCart: jest.fn(),
    recordFunnel: jest.fn(),
  };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require("@/lib/api");

it("places an all-zero basket with no transfer", async () => {
  const cart = zeroBasket();
  agreeArtworkRights(`cart:${cart.id}`);
  holdVoucherCart(api, cart);
  api.checkoutCart.mockResolvedValue(placed());

  await renderInSafeArea(<CheckoutScreen />);
  await screen.findByText("Nothing to pay now");
  expect(screen.queryByLabelText("Show the GRIDGO QR to scan")).toBeNull();

  await fireEvent.press(screen.getByLabelText("Place this order"));

  await waitFor(() =>
    expect(api.checkoutCart).toHaveBeenCalledWith(cart.id, null, expect.objectContaining({ accepted: true }), null),
  );
});
