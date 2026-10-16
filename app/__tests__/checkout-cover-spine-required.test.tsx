import { cleanup, fireEvent, screen } from "@testing-library/react-native";

import CheckoutScreen from "@/app/checkout";
import type { Cart, CoverSpineRecord } from "@/lib/api";
import { useCart } from "@/store/cart";
import { useCheckoutPayment } from "@/store/checkoutPayment";
import { useDesignLink } from "@/store/designLink";
import {
  CHECKOUT_SETTINGS,
  checkoutCart,
  checkoutLine,
  checkoutListing,
  renderInSafeArea,
} from "@/test/checkoutFixtures";
import { agreeArtworkRights } from "@/test/legalGate";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), navigate: jest.fn(), dismissTo: jest.fn(), back: jest.fn() }),
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

const BOOK = checkoutListing({ id: "sci_book", subcategoryCode: "binding_hardbound", name: "Hardbound thesis", coverSpineForm: true });

const GIVEN: CoverSpineRecord = {
  status: "given",
  cover: "first_page",
  coverFileId: null,
  spine: { institutionCode: null, title: "Flood Risk Mapping", author: "Sample Author", month: 10, year: 2026 },
  spineDate: "October 2026",
  spineSummary: "Flood Risk Mapping | Sample Author | October 2026",
};

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
  mockPush.mockReset();
});

afterEach(async () => {
  await cleanup();
});

// gridgo-client#247: its own file, because it presses (AGENTS.md).
describe("checkout with a required cover and spine missing", () => {
  it("takes the client to the book's form instead of placing the order", async () => {
    useCheckoutPayment.getState().setReference("1234567890123");
    await show(checkoutCart({ lines: [checkoutLine({ listing: BOOK, coverSpine: null, coverSpineRequired: true })] }));
    await screen.findByText("WHAT GRIDGO IS PRINTING");

    await fireEvent.press(screen.getByLabelText("Place this order"));

    expect(api.checkoutCart).not.toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/request/artwork", params: { lineId: "cline_1", focus: "cover" } });
  });
});
