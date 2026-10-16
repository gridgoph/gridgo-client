import { cleanup, fireEvent, screen } from "@testing-library/react-native";

import CheckoutScreen from "@/app/checkout";
import type { Cart } from "@/lib/api";
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

const LAYOUT_LISTING = checkoutListing({ printLayouts: ["fit_to_paper", "actual_size_centered"] });

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

// gridgo-client#245. Store-driven tests first; the one that presses goes last (AGENTS.md).
describe("checkout and the print layout", () => {
  it("holds the order until a layout is chosen, and says where to choose it", async () => {
    await show(checkoutCart({ lines: [checkoutLine({ listing: LAYOUT_LISTING, printLayout: null, printLayoutCheck: null })] }));
    await screen.findByText("WHAT GRIDGO IS PRINTING");

    expect(screen.getByText("No layout chosen yet. Open Artwork to choose one.")).toBeTruthy();
    expect(screen.getByText("Choose how Flyers sits on the paper. Open its Artwork to choose.")).toBeTruthy();
  });

  it("names the layout on the line and never blocks on a cut-off", async () => {
    await show(
      checkoutCart({
        lines: [
          checkoutLine({
            listing: LAYOUT_LISTING,
            printLayout: "actual_size_centered",
            printLayoutCheck: {
              supportedLayouts: ["fit_to_paper", "actual_size_centered"],
              layout: "actual_size_centered",
              paper: { optionId: "opt_a4", label: "A4", widthMilli: 210000, heightMilli: 297000, pageSize: "A4" },
              files: [],
              exceedsPaper: true,
              cutOff: true,
              scaleChanges: false,
              suggestedPaper: null,
              unknown: [],
            },
          }),
        ],
      }),
    );
    await screen.findByText("WHAT GRIDGO IS PRINTING");

    expect(screen.getByText("Layout: Actual size, centred. Parts are cut off on A4.")).toBeTruthy();
    expect(screen.queryByText(/sits on the paper/)).toBeNull();
  });

  it("takes the client to the layout choice when GRIDGO refuses the one on the line", async () => {
    api.checkoutCart.mockRejectedValue(
      new api.ApiError(409, {
        error: "print_layout_not_supported",
        message: "Choose a layout this product supports.",
        lineId: "cline_1",
        field: "printLayout",
        supported: ["actual_size_centered"],
      }),
    );
    useCheckoutPayment.getState().setReference("1234567890123");
    await show(checkoutCart({ lines: [checkoutLine({ listing: LAYOUT_LISTING, printLayout: "fit_to_paper", printLayoutCheck: null })] }));
    await screen.findByText("WHAT GRIDGO IS PRINTING");

    await fireEvent.press(screen.getByLabelText("Place this order"));

    expect(await screen.findByText("This shop no longer prints that layout. Choose one of the layouts it offers.")).toBeTruthy();
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/request/artwork", params: { lineId: "cline_1", focus: "layout" } });
  });
});
