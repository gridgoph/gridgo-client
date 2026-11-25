import { fireEvent, screen, waitFor } from "@testing-library/react-native";

import CheckoutScreen from "@/app/checkout";
import { agreeArtworkRights } from "@/test/legalGate";
import { renderInSafeArea, voucherCart } from "@/test/checkoutVoucherHarness";
import { withMemberPerk } from "@/test/membershipFixtures";
import { holdVoucherCart, placed } from "@/test/voucherPlaceHarness";

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

it("draws the perk by its label, says the use, and sends back exactly what it showed", async () => {
  agreeArtworkRights("cart:cart_1");
  holdVoucherCart(api, withMemberPerk(voucherCart()));
  api.checkoutCart.mockResolvedValue(placed({ downpaymentMinor: 6500, downpaymentStatus: "pending_confirmation", downpaymentMethod: "qr_manual" }));
  await renderInSafeArea(<CheckoutScreen />);
  await screen.findByText("WHAT GRIDGO IS PRINTING");
  expect(screen.getByLabelText("Sample Guild member, minus ₱4.00")).toBeTruthy();
  expect(screen.getByText("Member perk 3 of 5 this term, applied automatically. 2 left after this order.")).toBeTruthy();
  // Printing stays gross and the total is the quote's own.
  expect(screen.getAllByText("₱44.00").length).toBeGreaterThan(0);
  expect(screen.getAllByText("₱65.00").length).toBeGreaterThan(0);

  await fireEvent.changeText(screen.getByLabelText("Payment reference"), "1234567890123");
  await waitFor(() => expect(screen.getByLabelText("Payment reference").props.value).toBe("1234567890123"));
  await fireEvent.press(screen.getByLabelText("Place this order"));

  await waitFor(() =>
    expect(api.checkoutCart).toHaveBeenCalledWith(
      "cart_1",
      { reference: "1234567890123", proofFileId: "file_proof" },
      expect.objectContaining({ accepted: true }),
      null,
      400,
    ),
  );
});
