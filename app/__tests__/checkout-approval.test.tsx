import { cleanup, screen } from "@testing-library/react-native";

import CheckoutScreen from "@/app/checkout";
import type { Cart } from "@/lib/api";
import { DRAWN_REASON } from "@/lib/approvalProof";
import { useApproval } from "@/store/approval";
import { useCart } from "@/store/cart";
import { useCheckoutPayment } from "@/store/checkoutPayment";
import { useDesignLink } from "@/store/designLink";
import { CHECKOUT_SETTINGS, checkoutCart, checkoutLine, checkoutListing, renderInSafeArea } from "@/test/checkoutFixtures";
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

const SHIRTS = checkoutListing({ id: "sci_shirts", name: "Event shirts" });
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

// gridgo-client#248. Rendering only: no test here presses anything (AGENTS.md).
describe("approving the basket at checkout", () => {
  it("asks a standard order for one tap, after restating what it covers", async () => {
    await show(checkoutCart({ lines: [checkoutLine({ approvalMethod: "one_tap" })] }));
    expect(await screen.findByText("APPROVE YOUR ORDER")).toBeTruthy();
    expect(screen.getByText("WHAT YOU ARE APPROVING")).toBeTruthy();
    const box = screen.getByRole("checkbox", { name: "I approve this order" });
    expect(box.props.accessibilityState.checked).toBe(false);
    expect(screen.queryByRole("button", { name: "Sign to approve this order" })).toBeNull();
    expect(screen.getByText('Tick "I approve this order" at the end of this page.')).toBeTruthy();
  });

  it("asks for a signature when the basket holds custom merchandise", async () => {
    await show(
      checkoutCart({
        lines: [
          checkoutLine({ approvalMethod: "one_tap" }),
          checkoutLine({ id: "cline_2", catalogItemId: "sci_shirts", listing: SHIRTS, approvalMethod: "drawn", sortOrder: 1 }),
        ],
      }),
    );
    expect(await screen.findByText(DRAWN_REASON)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sign to approve this order" })).toBeTruthy();
    expect(screen.queryByRole("checkbox", { name: "I approve this order" })).toBeNull();
    expect(screen.getByText("Sign to approve your order at the end of this page.")).toBeTruthy();
  });

  it("shows the signature that will be sent", async () => {
    useApproval.getState().sign("cart:cart_1", "1", SIGNATURE);
    await show(checkoutCart({ lines: [checkoutLine({ approvalMethod: "drawn" })] }));
    expect(await screen.findByLabelText("Your signature")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sign again" })).toBeTruthy();
    expect(screen.getByText("GRIDGO checks your file before the shop starts.")).toBeTruthy();
  });

  it("asks again once the basket has changed since the approval", async () => {
    useApproval.getState().approve("cart:cart_1", "1");
    await show(checkoutCart({ version: 2, lines: [checkoutLine({ approvalMethod: "one_tap" })] }));
    expect(await screen.findByText("Your order changed after you approved it. Check it again and approve this version.")).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: "I approve this order" }).props.accessibilityState.checked).toBe(false);
  });

  it("asks nothing on an API that names no approval method", async () => {
    await show(checkoutCart({ lines: [checkoutLine()] }));
    expect(await screen.findByText("WHAT GRIDGO IS PRINTING")).toBeTruthy();
    expect(screen.queryByText("APPROVE YOUR ORDER")).toBeNull();
  });
});
