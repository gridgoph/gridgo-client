import { fireEvent, screen, waitFor } from "@testing-library/react-native";

import CheckoutScreen from "@/app/checkout";
import { ApiError } from "@/lib/api";
import { agreeArtworkRights } from "@/test/legalGate";
import { renderInSafeArea, voucherCart } from "@/test/checkoutVoucherHarness";
import { withMemberPerk } from "@/test/membershipFixtures";
import { holdVoucherCart } from "@/test/voucherPlaceHarness";

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

it("a perk that moved places nothing, shows the new total and says what to do", async () => {
  agreeArtworkRights("cart:cart_1");
  holdVoucherCart(api, withMemberPerk(voucherCart()));
  api.checkoutCart.mockImplementation(async () => {
    api.getCart.mockResolvedValue(withMemberPerk(voucherCart(), 0));
    throw new ApiError(409, { error: "member_perk_changed", memberPerkMinor: 0 });
  });
  await renderInSafeArea(<CheckoutScreen />);
  await screen.findByText("WHAT GRIDGO IS PRINTING");

  await fireEvent.changeText(screen.getByLabelText("Payment reference"), "1234567890123");
  await waitFor(() => expect(screen.getByLabelText("Payment reference").props.value).toBe("1234567890123"));
  await fireEvent.press(screen.getByLabelText("Place this order"));

  expect(await screen.findByText(/can no longer be used on this order, so your total is ₱69\.00\. Your order was not placed/)).toBeTruthy();
  expect(screen.getByText(/Message GRIDGO before you pay again/)).toBeTruthy();
  expect(screen.queryByTestId("member-perk-row")).toBeNull();
  expect(screen.getAllByText("₱69.00").length).toBeGreaterThan(0);
});
