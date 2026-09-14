import { cleanup, fireEvent, render, screen } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import CheckoutScreen from "@/app/checkout";
import type { Cart, CartLineRecord, PlatformSettings } from "@/lib/api";
import { useCart } from "@/store/cart";
import { useCheckoutPayment } from "@/store/checkoutPayment";

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockNavigate = jest.fn();

jest.mock("expo-router", () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    navigate: mockNavigate,
    back: jest.fn(),
  }),
  useFocusEffect: (effect: () => void) => {
    // Required inside the factory: jest.mock is hoisted above imports.
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
    getCatalogShop: jest.fn(),
    setCartFulfilment: jest.fn(),
    setCartDropoffs: jest.fn(),
    listAddresses: jest.fn(),
    updateCartLine: jest.fn(),
    removeCartLine: jest.fn(),
    checkoutCart: jest.fn(),
  };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require("@/lib/api");

const SETTINGS: PlatformSettings = {
  issueWindowHours: 24,
  serviceFeeRateBps: 1000,
  deliveryFeeBands: [
    { maxDistanceMeters: 4999, feeMinor: 2500 },
    { maxDistanceMeters: 10000, feeMinor: 5000 },
    { maxDistanceMeters: null, feeMinor: 7500 },
  ],
};

const SHOP = {
  supplierId: "user_lovis",
  shopName: "Lovis Printshop",
  shop: { lat: 7.0731, lng: 125.6128, label: "Bajada, Davao City" },
  media: [],
  categories: ["marketing_collateral"],
  services: [],
};

function listing() {
  return {
    id: "sci_flyers",
    supplierId: "user_lovis",
    supplierServiceId: "svc",
    categoryCode: "marketing_collateral",
    subcategoryCode: "flyers",
    name: "Flyers",
    description: null,
    basePriceMinor: 2500,
    fromPriceMinor: 2500,
    effectivePriceMinor: 4000,
    pricingUnit: "per_package" as const,
    packageQty: 100,
    measurementKind: "none" as const,
    measureUnit: null,
    minimumWidthMilli: null,
    minimumHeightMilli: null,
    minimumLengthMilli: null,
    minimumOrderQuantity: null,
    priceTiers: [],
    speedTiers: [],
    pricingBasis: "per_unit",
    turnaroundMode: "override" as const,
    turnaroundHours: 48,
    rush: null,
    acceptedFormats: [],
    photos: [],
    prepSteps: [],
    optionGroups: [
      {
        id: "g_size",
        name: "Size",
        kind: "spec" as const,
        helpText: null,
        required: true,
        selectionMode: "single" as const,
        sortOrder: 0,
        version: 1,
        options: [
          { id: "o_a4", label: "A4", priceModifierMinor: 1500, specBinding: null, sortOrder: 0 },
        ],
      },
    ],
    version: 1,
    serviceVersion: 1,
  };
}

function line(overrides: Partial<CartLineRecord> = {}): CartLineRecord {
  return {
    id: "cline_1",
    supplierId: "user_lovis",
    catalogItemId: "sci_flyers",
    quantity: 1,
    optionIds: ["o_a4"],
    measurement: null,
    structuredSpec: { size: "A4" },
    artworkFileId: "file_art",
    mockupFileId: null,
    dropoff: null,
    sortOrder: 0,
    listing: listing(),
    lineSubtotalMinor: 4000,
    ...overrides,
  };
}

function cart(overrides: Partial<Cart> = {}): Cart {
  return {
    id: "cart_1",
    state: "draft",
    version: 1,
    serviceLevel: "standard",
    scheduledFor: null,
    fulfillmentMode: "delivery",
    defaultDropoff: { lat: 7.076, lng: 125.615, label: "12 Quimpo Blvd, Talomo" },
    lines: [line()],
    checkedOutOrderId: null,
    createdAt: "2026-08-24T00:00:00.000Z",
    updatedAt: "2026-08-24T00:00:00.000Z",
    ...overrides,
  };
}

function renderInSafeArea(ui: ReactElement) {
  return render(ui, {
    wrapper: ({ children }) => (
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 390, height: 844 },
          insets: { top: 47, left: 0, right: 0, bottom: 34 },
        }}
      >
        {children}
      </SafeAreaProvider>
    ),
  });
}

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  mockPush.mockClear();
  mockReplace.mockClear();
  mockNavigate.mockClear();
  useCheckoutPayment.getState().reset();
  api.getSettings.mockResolvedValue(SETTINGS);
  api.getCart.mockResolvedValue(cart());
  api.getCatalogShop.mockResolvedValue(SHOP);
  api.listAddresses.mockResolvedValue([]);
  api.setCartDropoffs.mockResolvedValue(cart());
  useCart.setState({
    cartId: "cart_1",
    cart: cart(),
    loading: false,
    busy: false,
    error: null,
    hydrated: true,
  });
});

describe("CheckoutScreen", () => {
  it("groups the order as GRIDGO's print run, not a shop's", async () => {
    await renderInSafeArea(<CheckoutScreen />);

    expect(await screen.findByText("WHAT GRIDGO IS PRINTING")).toBeTruthy();
    expect(screen.getByText("Flyers")).toBeTruthy();
    expect(screen.getByText("A4")).toBeTruthy();

    // The board is still read for its pin, so delivery can be measured. Its
    // name never reaches the sheet.
    expect(screen.queryByText(/Lovis/i)).toBeNull();
    expect(screen.queryByLabelText(/Lovis/i)).toBeNull();
    expect(screen.queryByText(/Bajada/i)).toBeNull();
    expect(screen.getByText("Add more to this run")).toBeTruthy();
  });

  it("shows the payable total without naming GRIDGO's service fee", async () => {
    await renderInSafeArea(<CheckoutScreen />);
    await screen.findByText("WHAT GRIDGO IS PRINTING");

    // ₱40 items + 10% service fee + the under-5km delivery band. The fee is
    // still inside the QR 75/25 and the total; it is not a row a client sees.
    expect(screen.getAllByText("₱40.00").length).toBeGreaterThan(0);
    expect(screen.queryByText(/GRIDGO service fee/i)).toBeNull();
    expect(screen.queryByText(/10%/)).toBeNull();
    expect(screen.getByText("₱25.00")).toBeTruthy();
    // Invoice and pinned commit bar show the same total.
    expect(screen.getAllByText("₱69.00")).toHaveLength(2);
  });

  it("splits the payment 75/25 rather than asking for all of it", async () => {
    await renderInSafeArea(<CheckoutScreen />);
    await screen.findByText("WHAT GRIDGO IS PRINTING");

    expect(screen.getByText("Send now (75%)")).toBeTruthy();
    expect(screen.getByText("Before delivery (25%)")).toBeTruthy();
    expect(screen.getByText("₱51.75")).toBeTruthy();
    expect(screen.getByText("₱17.25")).toBeTruthy();
  });

  it("offers QR Ph and nothing else", async () => {
    await renderInSafeArea(<CheckoutScreen />);
    await screen.findByText("WHAT GRIDGO IS PRINTING");

    expect(screen.getByText("QR Ph")).toBeTruthy();
    expect(screen.getByText("Only method")).toBeTruthy();
    // Both are retired server-side, so neither is a control a client can pick.
    // The notice deliberately *says* there is no cash on delivery — that is the
    // constraint stated before someone hits it, not an option being offered.
    expect(screen.queryByLabelText(/cash on delivery/i)).toBeNull();
    expect(screen.queryByLabelText(/pilot credit/i)).toBeNull();
    expect(screen.queryByText(/pilot credit/i)).toBeNull();
    expect(screen.getByText(/There is no cash on delivery/)).toBeTruthy();
  });

  it("does not re-ask when the job is wanted", async () => {
    await renderInSafeArea(<CheckoutScreen />);
    await screen.findByText("WHAT GRIDGO IS PRINTING");

    expect(screen.queryByText("WHEN YOU WANT IT")).toBeNull();
    expect(screen.queryByLabelText("Standard")).toBeNull();
    expect(screen.queryByLabelText("Scheduled")).toBeNull();
    expect(screen.queryByLabelText("Express")).toBeNull();
    expect(screen.queryByText("Express")).toBeNull();
  });

  it("says swipe left to delete on the order", async () => {
    await renderInSafeArea(<CheckoutScreen />);
    await screen.findByText("WHAT GRIDGO IS PRINTING");

    expect(screen.getByText("Swipe left to delete")).toBeTruthy();
  });

  it("asks for the receipt and the reference before it will place anything", async () => {
    await renderInSafeArea(<CheckoutScreen />);
    await screen.findByText("WHAT GRIDGO IS PRINTING");

    expect(screen.getByLabelText("Add the screenshot")).toBeTruthy();
    expect(screen.getByLabelText("Payment reference")).toBeTruthy();

    const button = screen.getByLabelText("Place this order");
    expect(button.props.accessibilityState.disabled).toBe(false);
    expect(screen.getByText("The screenshot of your QR transfer, so Operations can match it.")).toBeTruthy();

    fireEvent.press(button);
    expect(api.checkoutCart).not.toHaveBeenCalled();
    expect(screen.getAllByText("Add the screenshot of your QR payment.").length).toBeGreaterThan(0);
  });

  it("names the item still waiting for artwork", async () => {
    const withoutArt = cart({ lines: [line({ artworkFileId: null })] });
    api.getCart.mockResolvedValue(withoutArt);
    useCart.setState({ cart: withoutArt });
    await renderInSafeArea(<CheckoutScreen />);
    await screen.findByText("WHAT GRIDGO IS PRINTING");

    fireEvent.press(screen.getByLabelText("Place this order"));
    expect(screen.getByText("Attach artwork to Flyers before you place this.")).toBeTruthy();
  });

  it("withholds the total until GRIDGO knows where the job is going", async () => {
    const noAddress = cart({ defaultDropoff: null });
    api.getCart.mockResolvedValue(noAddress);
    useCart.setState({ cart: noAddress });
    await renderInSafeArea(<CheckoutScreen />);
    await screen.findByText("WHAT GRIDGO IS PRINTING");

    expect(screen.getByText("Not yet")).toBeTruthy();
    expect(screen.getByText("Set with your address")).toBeTruthy();
  });

  it("still shows the GCash plate when the 75% cannot be totalled yet", async () => {
    const noAddress = cart({ defaultDropoff: null });
    api.getCart.mockResolvedValue(noAddress);
    useCart.setState({ cart: noAddress });
    await renderInSafeArea(<CheckoutScreen />);
    await screen.findByText("WHAT GRIDGO IS PRINTING");

    fireEvent.press(screen.getByLabelText("Show the GRIDGO QR to scan"));

    const image = await screen.findByLabelText("GRIDGO's QR Ph code");
    expect(image).toBeTruthy();
    expect(screen.getByText("Scan to send 75%")).toBeTruthy();
    expect(screen.getAllByText("Not yet").length).toBeGreaterThan(0);
  });

  it("keeps the order when the client goes Home", async () => {
    await renderInSafeArea(<CheckoutScreen />);
    await screen.findByText("WHAT GRIDGO IS PRINTING");

    fireEvent.press(screen.getByLabelText("Go to Home and keep this order"));

    expect(mockReplace).toHaveBeenCalledWith("/(tabs)/home");
    // The basket is GRIDGO's, and leaving does not spend it.
    expect(useCart.getState().cartId).toBe("cart_1");
  });

  it("says how delivery is priced without giving away where it is printed", async () => {
    await renderInSafeArea(<CheckoutScreen />);
    await screen.findByText("WHAT GRIDGO IS PRINTING");

    expect(
      screen.getByText(
        "Delivery is charged by the distance from where it is printed to your address.",
      ),
    ).toBeTruthy();
    expect(screen.queryByText(/Bajada/i)).toBeNull();
  });

  it("collects at GRIDGO Office, never at the press that printed it", async () => {
    const collecting = cart({ fulfillmentMode: "pickup" });
    api.getCart.mockResolvedValue(collecting);
    useCart.setState({ cartId: "cart_1", cart: collecting, loading: false, busy: false, error: null });
    await renderInSafeArea(<CheckoutScreen />);
    await screen.findByText("WHAT GRIDGO IS PRINTING");

    expect(screen.getByText("GRIDGO Office")).toBeTruthy();
    expect(screen.getByText("Poblacion District, Davao City")).toBeTruthy();
    expect(screen.getByText("7.092287, 125.616511")).toBeTruthy();
    expect(
      screen.getByText(/GRIDGO's rider brings your finished job to the office/),
    ).toBeTruthy();
    expect(screen.getByLabelText("Open GRIDGO Office in Maps")).toBeTruthy();
    expect(screen.getByText("You collect at GRIDGO Office. No delivery charge.")).toBeTruthy();

    // One collect-at point, whoever printed it, and never a shop counter.
    expect(screen.queryByText(/Lovis/i)).toBeNull();
    expect(screen.queryByText(/Bajada/i)).toBeNull();
    expect(screen.queryByText(/collect from this counter/i)).toBeNull();
  });

  it("shows where the client is in the run", async () => {
    await renderInSafeArea(<CheckoutScreen />);
    await screen.findByText("WHAT GRIDGO IS PRINTING");

    expect(screen.getByLabelText("Step 4 of 4: Pay, where you are now.")).toBeTruthy();
    expect(screen.getByLabelText("Step 3 of 4: Artwork, done. Go back to it.")).toBeTruthy();
  });

  it("opens the QR to scan, rather than only naming the method", async () => {
    await renderInSafeArea(<CheckoutScreen />);
    await screen.findByText("WHAT GRIDGO IS PRINTING");

    expect(screen.queryByLabelText("GRIDGO's QR Ph code")).toBeNull();

    fireEvent.press(screen.getByLabelText("Show the GRIDGO QR to scan"));

    expect(await screen.findByLabelText("GRIDGO's QR Ph code")).toBeTruthy();
    expect(screen.getByText("Scan to send 75%")).toBeTruthy();
    // The 75% of ₱69.00, over the code it is being sent with.
    expect(screen.getAllByText("₱51.75").length).toBeGreaterThan(0);
    // The parts Operations matches by hand stay out on the sheet behind.
    expect(screen.getByLabelText("Add the screenshot")).toBeTruthy();
    expect(screen.getByLabelText("Payment reference")).toBeTruthy();
  });

  it("prefers the uploaded payment QR from settings over the bundled plate", async () => {
    api.getSettings.mockResolvedValue({
      ...SETTINGS,
      paymentQr: { method: "qr_manual", caption: "QR Ph", imageUrl: "/public/payment-qr?v=file_live" },
    } as PlatformSettings);
    await renderInSafeArea(<CheckoutScreen />);
    await screen.findByText("WHAT GRIDGO IS PRINTING");

    fireEvent.press(screen.getByLabelText("Show the GRIDGO QR to scan"));

    const image = await screen.findByLabelText("GRIDGO's QR Ph code");
    expect(image.props.source?.uri).toEqual(expect.stringContaining("/public/payment-qr?v=file_live"));
  });

  it("invites a first order rather than showing an empty sheet", async () => {
    api.getCart.mockResolvedValue(cart({ lines: [] }));
    useCart.setState({ cart: cart({ lines: [] }), loading: false, hydrated: true });
    await renderInSafeArea(<CheckoutScreen />);

    expect(await screen.findByText("Nothing to print yet")).toBeTruthy();
    fireEvent.press(screen.getByText("Start a print job"));
    expect(mockReplace).toHaveBeenCalledWith("/request/category");
  });

  it("lets an empty basket leave for Home", async () => {
    api.getCart.mockResolvedValue(cart({ lines: [] }));
    useCart.setState({ cart: cart({ lines: [] }), loading: false, hydrated: true });
    await renderInSafeArea(<CheckoutScreen />);

    fireEvent.press(await screen.findByText("Go to Home"));
    expect(mockReplace).toHaveBeenCalledWith("/(tabs)/home");
  });

  it("does not paint the Pay sheet while an empty basket is still loading", async () => {
    api.getCart.mockReturnValue(new Promise(() => {}));
    useCart.setState({
      cartId: "cart_1",
      cart: null,
      loading: true,
      hydrated: true,
    });
    await renderInSafeArea(<CheckoutScreen />);

    expect(screen.getByText("Loading your order…")).toBeTruthy();
    expect(screen.queryByText("HOW IT GETS TO YOU")).toBeNull();
    expect(screen.queryByText("Nothing to print yet")).toBeNull();
  });

  it("keeps the sheet up when a line only has the compact listing add returned", async () => {
    // POST /me/carts/:id/lines returns a stub without photos. Reading
    // listing.photos[0] threw and the screen popped the moment the cart opened.
    const compact = cart({
      lines: [
        line({
          listing: {
            id: "sci_flyers",
            name: "Flyers",
            supplierId: "user_lovis",
            fromPriceMinor: 2500,
            effectivePriceMinor: 4000,
            selectedOptions: [{ id: "o_a4", label: "A4" }],
          } as never,
        }),
      ],
    });
    api.getCart.mockResolvedValue(compact);
    useCart.setState({ cartId: "cart_1", cart: compact, loading: false, hydrated: true });
    await renderInSafeArea(<CheckoutScreen />);

    expect(await screen.findByText("WHAT GRIDGO IS PRINTING")).toBeTruthy();
    expect(screen.getByText("Flyers")).toBeTruthy();
    expect(screen.getByText("A4")).toBeTruthy();
    expect(screen.getByText("HOW IT GETS TO YOU")).toBeTruthy();
  });

  it("keeps Home in the footer and leaves Multi-drop unpressable", async () => {
    await renderInSafeArea(<CheckoutScreen />);
    await screen.findByText("WHAT GRIDGO IS PRINTING");

    expect(screen.getByLabelText("Go to Home and keep this order")).toBeTruthy();
    expect(screen.queryByText("Leaving keeps everything here — it is waiting when you come back.")).toBeNull();
    expect(screen.getByLabelText("Multi-drop").props.accessibilityState.disabled).toBe(true);
    expect(screen.getByText("Multi-drop is not offered yet.")).toBeTruthy();
  });

  it("fills delivery from the saved Home address when the basket has none", async () => {
    const noAddress = cart({ defaultDropoff: null });
    const withHome = cart({
      defaultDropoff: { lat: 7.07, lng: 125.61, label: "Home" },
    });
    api.getCart.mockResolvedValue(noAddress);
    api.listAddresses.mockResolvedValue([
      {
        id: "addr_home",
        label: "Home",
        addressLine: "Home",
        point: { lat: 7.07, lng: 125.61, label: "Home" },
        isDefault: true,
        version: 1,
        createdAt: "2026-09-08T00:00:00.000Z",
        updatedAt: "2026-09-08T00:00:00.000Z",
      },
    ]);
    api.setCartDropoffs.mockResolvedValue(withHome);
    useCart.setState({ cart: noAddress });
    await renderInSafeArea(<CheckoutScreen />);
    await screen.findByText("WHAT GRIDGO IS PRINTING");

    await screen.findByText("Home");
    expect(api.setCartDropoffs).toHaveBeenCalledWith("cart_1", {
      defaultDropoff: { lat: 7.07, lng: 125.61, label: "Home" },
    });
  });

  it("keeps the screenshot and reference after checkout remounts", async () => {
    const { EMPTY_PROOF } = jest.requireActual("@/store/checkoutPayment") as typeof import("@/store/checkoutPayment");
    useCheckoutPayment.setState({
      cartId: "cart_1",
      proof: {
        ...EMPTY_PROOF,
        phase: "stored",
        fileName: "gcash.png",
        fileId: "file_kept",
        localUri: "file://gcash.png",
        progress: 1,
      },
      ocr: { status: "filled", reference: "965373469" },
      reference: "965373469",
    });
    await renderInSafeArea(<CheckoutScreen />);
    expect(await screen.findByLabelText("Payment reference")).toBeTruthy();
    expect(screen.getByLabelText("Payment reference").props.value).toBe("965373469");
    expect(screen.getByLabelText("View the payment screenshot")).toBeTruthy();

    cleanup();
    await renderInSafeArea(<CheckoutScreen />);
    expect(await screen.findByLabelText("Payment reference")).toBeTruthy();
    expect(screen.getByLabelText("Payment reference").props.value).toBe("965373469");
    expect(screen.getByLabelText("View the payment screenshot")).toBeTruthy();
  });
});
