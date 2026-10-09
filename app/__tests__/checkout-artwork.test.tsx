import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react-native";

import CheckoutScreen from "@/app/checkout";
import type { Cart } from "@/lib/api";
import { useCart } from "@/store/cart";
import { checkKey, useDesignLink } from "@/store/designLink";
import { useCheckoutPayment } from "@/store/checkoutPayment";
import {
  CHECKOUT_SETTINGS,
  checkoutCart,
  checkoutLine,
  renderInSafeArea,
} from "@/test/checkoutFixtures";
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

const LINK = { formatCode: "canva_link", url: "https://www.canva.com/design/DAF1/view" };

function show(cart: Cart) {
  // The per-order artwork box, ticked by the client.
  agreeArtworkRights(`cart:${cart.id}`);
  api.getCart.mockResolvedValue(cart);
  useCart.setState({ cartId: cart.id, cart, loading: false, busy: false, error: null, hydrated: true });
  return renderInSafeArea(<CheckoutScreen />);
}

beforeEach(() => {
  api.getSettings.mockResolvedValue(CHECKOUT_SETTINGS);
  api.listAddresses.mockResolvedValue([]);
  api.checkArtworkLink.mockReset();
  useDesignLink.getState().reset();
  useCheckoutPayment.getState().reset();
});

afterEach(async () => {
  await cleanup();
});

/*
  A design link must pass its check before the order can go (gridgo-api#122).
  Store-driven tests first; the one that presses goes last (AGENTS.md).
*/
describe("checkout and the artwork check", () => {
  it("checks a link kept on an earlier visit, and says so while it runs", async () => {
    api.checkArtworkLink.mockReturnValue(new Promise(() => {}));
    await show(checkoutCart({ lines: [checkoutLine({ artworkFileId: null, artworkLinks: [LINK] })] }));
    await screen.findByText("WHAT GRIDGO IS PRINTING");

    expect(api.checkArtworkLink).toHaveBeenCalledWith(LINK);
    expect(await screen.findByText("Checking the design link…")).toBeTruthy();
  });

  it("names a private link on its line, with the way to fix it", async () => {
    useDesignLink.setState({
      checks: {
        [checkKey(LINK)]: {
          phase: "checked",
          check: { ok: false, reachable: true, httpStatus: 401, provider: "canva", access: "sign_in_required", message: "Sign in" },
        },
      },
    });
    await show(checkoutCart({ lines: [checkoutLine({ artworkFileId: null, artworkLinks: [LINK] })] }));
    await screen.findByText("WHAT GRIDGO IS PRINTING");

    expect(screen.getByText("This link is private. Open Artwork to fix it.")).toBeTruthy();
    expect(api.checkArtworkLink).not.toHaveBeenCalled();
  });

  it("puts checkout's refusal on the line it is about, in GRIDGO's words", async () => {
    api.checkArtworkLink.mockResolvedValue({
      ok: true, reachable: true, httpStatus: 200, provider: "canva", access: "public_view", message: "ok",
    });
    api.checkoutCart.mockRejectedValue(
      new api.ApiError(409, {
        error: "artwork_link_check_failed",
        field: "artwork",
        lineId: "cline_1",
        url: LINK.url,
        access: "unknown",
        message: "GRIDGO could not confirm this design is viewable. Make it viewable by anyone with the link, or upload the file.",
      }),
    );
    useCheckoutPayment.getState().setReference("1234567890123");
    await show(checkoutCart({ lines: [checkoutLine({ artworkFileId: null, artworkLinks: [LINK] })] }));
    await screen.findByText("WHAT GRIDGO IS PRINTING");
    await waitFor(() => expect(screen.queryByText("Checking the design link…")).toBeNull());

    await fireEvent.press(screen.getByLabelText("Place this order"));

    expect(
      await screen.findByText(
        "GRIDGO could not confirm this design is viewable. Make it viewable by anyone with the link, or upload the file.",
      ),
    ).toBeTruthy();
    expect(screen.getByText("GRIDGO cannot use the artwork on Flyers. Open its Artwork to fix it.")).toBeTruthy();
    expect(useDesignLink.getState().problems.cline_1?.code).toBe("artwork_link_check_failed");
  });
});
