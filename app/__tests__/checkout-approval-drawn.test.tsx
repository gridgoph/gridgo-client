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

jest.mock("@/lib/signatureUpload", () => ({ uploadSignature: jest.fn(async () => "file_signature") }));

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

const SIGNATURE = { width: 300, height: 180, strokes: [[{ x: 10, y: 100 }, { x: 200, y: 40 }]] };

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
 * A basket with custom merchandise uploads the drawn signature, then sends its
 * file id with the approval. One press, so its own file.
 */
it("uploads the signature and sends it with a drawn approval", async () => {
  useApproval.getState().sign("cart:cart_1", "3", SIGNATURE);
  api.checkoutCart.mockResolvedValue({ order: { id: "ord_1" }, invoice: { id: "inv_1" } });
  await show(checkoutCart({ version: 3, lines: [checkoutLine({ approvalMethod: "drawn" })] }));
  expect(await screen.findByLabelText("Your signature")).toBeTruthy();

  await fireEvent.press(screen.getByLabelText("Place this order"));

  await waitFor(() => expect(api.checkoutCart).toHaveBeenCalled());
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { uploadSignature } = require("@/lib/signatureUpload");
  expect(uploadSignature).toHaveBeenCalledWith(SIGNATURE);
  expect(api.checkoutCart.mock.calls[0][3]).toEqual(
    expect.objectContaining({ accepted: true, method: "drawn", signatureFileId: "file_signature", expectedCartVersion: 3 }),
  );
});
