import { fireEvent, screen, waitFor } from "@testing-library/react-native";

import CheckoutScreen from "@/app/checkout";
import { agreeArtworkRights } from "@/test/legalGate";
import { renderInSafeArea } from "@/test/checkoutVoucherHarness";
import { cashCart, holdVoucherCart, placed } from "@/test/voucherPlaceHarness";

/**
 * A launch voucher that leaves money owed now: the ordinary QR checkout,
 * screenshot and reference, exactly as before. A changeText and a press, so
 * its own file.
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

jest.mock("@/hooks/usePaymentProof", () => ({
  usePaymentProof: () => ({
    state: { phase: "stored", fileName: "receipt.jpg", fileId: "file_proof", localUri: "file://receipt.jpg", progress: 1, error: null },
    ocr: { status: "idle", reference: null },
    pick: jest.fn(),
    reset: jest.fn(),
  }),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require("@/lib/api");

it("still sends the QR reference and screenshot when cash is owed", async () => {
  agreeArtworkRights("cart:cart_1");
  holdVoucherCart(api, cashCart());
  api.checkoutCart.mockResolvedValue(
    placed({ downpaymentMinor: 4900, downpaymentStatus: "pending_confirmation", downpaymentMethod: "qr_manual" }),
  );

  await renderInSafeArea(<CheckoutScreen />);
  await screen.findByText("WHAT GRIDGO IS PRINTING");
  expect(screen.queryByText("Nothing to pay now")).toBeNull();

  await fireEvent.changeText(screen.getByLabelText("Payment reference"), "1234567890123");
  await waitFor(() => expect(screen.getByLabelText("Payment reference").props.value).toBe("1234567890123"));
  await fireEvent.press(screen.getByLabelText("Place this order"));

  await waitFor(() =>
    expect(api.checkoutCart).toHaveBeenCalledWith(
      "cart_1",
      { reference: "1234567890123", proofFileId: "file_proof" },
      expect.objectContaining({ accepted: true }),
      null,
    ),
  );
});
