import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react-native";

import CheckoutScreen from "@/app/checkout";
import type { Cart } from "@/lib/api";
import { useApproval } from "@/store/approval";
import { useCart } from "@/store/cart";
import { useCheckoutPayment } from "@/store/checkoutPayment";
import { useDesignLink } from "@/store/designLink";
import { CHECKOUT_SETTINGS, checkoutCart, checkoutLine, renderInSafeArea } from "@/test/checkoutFixtures";
import { agreeArtworkRights } from "@/test/legalGate";

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
    checkArtworkLink: jest.fn(),
    checkoutCart: jest.fn(),
  };
});

jest.mock("@/hooks/usePaymentProof", () => ({
  usePaymentProof: () => ({
    state: { phase: "stored", fileName: "receipt.jpg", fileId: "file_proof", localUri: "file://r.jpg", progress: 1, error: null },
    ocr: { status: "idle", reference: null },
    pick: jest.fn(),
    reset: jest.fn(),
  }),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require("@/lib/api");


function show(cart: Cart) {
  agreeArtworkRights(`cart:${cart.id}`);
  api.getCart.mockResolvedValue(cart);
  useCart.setState({ cartId: cart.id, cart, loading: false, busy: false, error: null, hydrated: true });
  return renderInSafeArea(<CheckoutScreen />);
}

beforeEach(() => {
  api.getSettings.mockResolvedValue(CHECKOUT_SETTINGS);
  api.listAddresses.mockResolvedValue([]);
  useDesignLink.getState().reset();
  useCheckoutPayment.getState().reset();
  // The payment is filled in, so the first thing still asked is the approval.
  useCheckoutPayment.setState({ cartId: "cart_1", reference: "1234567890123" });
  useApproval.setState({ drafts: {}, samplePhotos: {}, uploaded: {} });
});

afterEach(async () => {
  await cleanup();
});

/**
 * Placing a standard order sends its one-tap approval with the payment, bound
 * to the basket version the client approved. One press, so its own file.
 */
it("sends the one-tap approval for the version the client approved", async () => {
  useApproval.getState().approve("cart:cart_1", "1");
  api.checkoutCart.mockResolvedValue({ order: { id: "ord_1" }, invoice: { id: "inv_1" } });
  await show(checkoutCart({ lines: [checkoutLine({ approvalMethod: "one_tap" })] }));
  expect(await screen.findByRole("checkbox", { name: "I approve this order" })).toBeTruthy();

  await fireEvent.press(screen.getByLabelText("Place this order"));

  await waitFor(() => expect(api.checkoutCart).toHaveBeenCalled());
  const [, , , approval] = api.checkoutCart.mock.calls[0];
  expect(approval).toEqual({
    accepted: true,
    method: "one_tap",
    expectedCartVersion: 1,
    device: { id: expect.stringMatching(/^client-/), platform: "ios", appVersion: expect.any(String) },
  });
  expect(approval).not.toHaveProperty("signatureFileId");
  // A placed order's approval is spent.
  await waitFor(() => expect(useApproval.getState().drafts["cart:cart_1"]).toBeUndefined());
});
