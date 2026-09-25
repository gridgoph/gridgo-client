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

afterEach(async () => {
  await cleanup();
});

beforeEach(() => {
  mockPush.mockClear();
  mockReplace.mockClear();
  mockNavigate.mockClear();
  useCheckoutPayment.getState().reset();
  api.getSettings.mockResolvedValue({ ...SETTINGS, downpaymentPercent: 100 });
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


/*
 * GRIDGO takes the whole total up front (`downpaymentPercent: 100` on
 * `GET /settings`). The legacy 75/25 sheet is pinned in `checkout.test.tsx`.
 * The press goes last: see "Running and testing" in AGENTS.md.
 */
describe("CheckoutScreen, paid in full", () => {
  it("asks for the whole total now, with no balance before delivery", async () => {
    await renderInSafeArea(<CheckoutScreen />);
    await screen.findByText("WHAT GRIDGO IS PRINTING");

    expect(screen.getByText("Pay in full now")).toBeTruthy();
    // ₱40 + 10% fee = ₱44 printing, + ₱25 delivery: the whole ₱69 is paid now.
    expect(screen.getAllByText("₱69.00").length).toBeGreaterThan(1);
    expect(screen.getByText(/You pay the whole total now, in one transfer/)).toBeTruthy();
    expect(screen.queryByText(/Before delivery/)).toBeNull();
    expect(screen.queryByText(/75%|25%/)).toBeNull();
    expect(screen.queryByText(/downpayment|balance/i)).toBeNull();
    expect(screen.queryByText(/the rest before delivery/)).toBeNull();
  });

  it("titles the QR for the whole total", async () => {
    await renderInSafeArea(<CheckoutScreen />);
    await screen.findByText("WHAT GRIDGO IS PRINTING");

    await fireEvent.press(screen.getByLabelText("Show the GRIDGO QR to scan"));

    expect(await screen.findByText("Scan to pay in full")).toBeTruthy();
    expect(screen.queryByText(/Scan to send/)).toBeNull();
  });
});
