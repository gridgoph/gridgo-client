import { cleanup, render, screen } from "@testing-library/react-native";
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
  // The four zones gridgo-api#121 seeds.
  deliveryFeeBands: [
    { zone: "nearby", label: "Nearby", maxDistanceMeters: 5000, feeMinor: 2500 },
    { zone: "away", label: "Away", maxDistanceMeters: 10000, feeMinor: 5000 },
    { zone: "long_distance", label: "Long Distance", maxDistanceMeters: 15000, feeMinor: 7500 },
    {
      zone: "out_of_zone",
      label: "Out of Zone",
      maxDistanceMeters: null,
      baseFeeMinor: 7500,
      perKmMinor: 1000,
    },
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
 * Checkout prices delivery from the four zones and says the zone, never the
 * kilometres, except Out of Zone (gridgo-client#156).
 */
describe("CheckoutScreen delivery zones", () => {
  it("prices a near drop-off flat and names its zone without a figure", async () => {
    await renderInSafeArea(<CheckoutScreen />);
    await screen.findByText("WHAT GRIDGO IS PRINTING");

    // About 400 m from the shop: Nearby, ₱25.
    expect(screen.getByText("₱25.00 · Nearby")).toBeTruthy();
    expect(screen.queryByText(/\bkm\b/)).toBeNull();
    expect(screen.getByLabelText("How does delivery distance work?")).toBeTruthy();
  });

  it("prices Out of Zone per started kilometre and shows the distance", async () => {
    // 16,045 m from the shop: shown as 16.0 km, charged as 17 started km.
    const far = cart({ defaultDropoff: { lat: 7.2174, lng: 125.6128, label: "Far away" } });
    api.getCart.mockResolvedValue(far);
    useCart.setState({ cart: far });

    await renderInSafeArea(<CheckoutScreen />);
    await screen.findByText("WHAT GRIDGO IS PRINTING");

    // ₱75 base + ₱10 × 17 = ₱245 — never ₱235 from the rounded 16.0 km.
    expect(screen.getByText("₱245.00 · Out of Zone · 16.0 km")).toBeTruthy();
    // ₱44 printing + ₱245 delivery.
    expect(screen.getAllByText("₱289.00").length).toBeGreaterThan(0);
  });
});
