import { cleanup, fireEvent, screen } from "@testing-library/react-native";

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
 * GRIDGO refuses an approval given for an older version of the basket: the
 * client is told why, beside the approval, and asked again. One press.
 */
it("asks again when GRIDGO says the basket changed after the approval", async () => {
  useApproval.getState().approve("cart:cart_1", "1");
  api.checkoutCart.mockRejectedValue(new api.ApiError(409, { error: "approval_cart_stale" }));
  await show(checkoutCart({ lines: [checkoutLine({ approvalMethod: "one_tap" })] }));
  expect(await screen.findByRole("checkbox", { name: "I approve this order" })).toBeTruthy();

  await fireEvent.press(screen.getByLabelText("Place this order"));

  expect((await screen.findAllByText("Your order changed after you approved it. Check it and approve it again.")).length).toBeGreaterThan(0);
  expect(useApproval.getState().drafts["cart:cart_1"]).toBeUndefined();
});
