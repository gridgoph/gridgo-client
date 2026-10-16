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

// gridgo-client#247. Store-driven tests first; the one that presses goes last (AGENTS.md).
describe("checkout and a hardbound book's cover and spine", () => {
  it("says the form is not given yet and never blocks while GRIDGO does not require it", async () => {
    await show(checkoutCart({ lines: [checkoutLine({ listing: BOOK, coverSpine: null, coverSpineRequired: false })] }));
    await screen.findByText("WHAT GRIDGO IS PRINTING");

    expect(screen.getByText("Cover and spine not given yet. Add them on its Artwork, or the shop asks you later.")).toBeTruthy();
    expect(screen.queryByText(/Add the cover and spine for/)).toBeNull();
  });

  it("names the agreed cover and the spine on the line", async () => {
    await show(checkoutCart({ lines: [checkoutLine({ listing: BOOK, coverSpine: GIVEN, coverSpineRequired: true })] }));
    await screen.findByText("WHAT GRIDGO IS PRINTING");

    expect(screen.getByText("Cover: First page of the file. Spine: Flood Risk Mapping | Sample Author | October 2026")).toBeTruthy();
    expect(screen.queryByText(/Add the cover and spine for/)).toBeNull();
  });

  it("holds the order while GRIDGO requires the form, and says where to fill it in", async () => {
    await show(checkoutCart({ lines: [checkoutLine({ listing: BOOK, coverSpine: null, coverSpineRequired: true })] }));
    await screen.findByText("WHAT GRIDGO IS PRINTING");

    expect(screen.getByText("Add the cover and spine details on its Artwork.")).toBeTruthy();
    expect(screen.getByText("Add the cover and spine for Hardbound thesis. Open its Artwork to fill them in.")).toBeTruthy();
  });

  it("takes the client to the form when GRIDGO turns the order down without it", async () => {
    api.checkoutCart.mockRejectedValue(
      new api.ApiError(409, { error: "cover_spine_required", lineId: "cline_1", field: "coverSpine" }),
    );
    useCheckoutPayment.getState().setReference("1234567890123");
    await show(checkoutCart({ lines: [checkoutLine({ listing: BOOK, coverSpine: null, coverSpineRequired: false })] }));
    await screen.findByText("WHAT GRIDGO IS PRINTING");

    await fireEvent.press(screen.getByLabelText("Place this order"));

    expect(await screen.findByText("This book needs its cover and spine details before you place the order.")).toBeTruthy();
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/request/artwork", params: { lineId: "cline_1", focus: "cover" } });
  });
});
