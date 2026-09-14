import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import CheckoutScreen from "@/app/checkout";
import type { Cart, CartLineRecord, PlatformSettings } from "@/lib/api";
import { useCart } from "@/store/cart";

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

jest.mock("@/hooks/usePaymentProof", () => ({
  usePaymentProof: () => ({
    state: {
      phase: "stored",
      fileName: "receipt.jpg",
      fileId: "file_proof",
      localUri: "file://receipt.jpg",
      progress: 1,
      error: null,
    },
    ocr: { status: "idle", reference: null },
    pick: jest.fn(),
    reset: jest.fn(),
  }),
}));

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

/**
 * Placing the order. Its own file because the flow is a changeText plus a
 * press, which spends the React 19 testing budget for later renders.
 */
describe("placing the order", () => {
  it("places with the cart's existing service level and the QR receipt", async () => {
    api.getSettings.mockResolvedValue(SETTINGS);
    api.listAddresses.mockResolvedValue([]);
    api.getCart.mockResolvedValue(cart());
    api.getCatalogShop.mockResolvedValue({
      supplierId: "user_lovis",
      shopName: "Lovis Printshop",
      shop: { lat: 7.0731, lng: 125.6128, label: "Bajada, Davao City" },
      media: [],
      categories: ["marketing_collateral"],
      services: [],
    });
    api.checkoutCart.mockResolvedValue({
      order: { id: "ord_1" },
      invoice: { id: "inv_1" },
    });
    useCart.setState({
      cartId: "cart_1",
      cart: cart(),
      loading: false,
      busy: false,
      error: null,
      hydrated: true,
    });

    await renderInSafeArea(<CheckoutScreen />);
    await screen.findByText("WHAT GRIDGO IS PRINTING");

    fireEvent.changeText(screen.getByLabelText("Payment reference"), "1234567890123");
    await waitFor(() =>
      expect(screen.getByLabelText("Payment reference").props.value).toBe("1234567890123"),
    );
    fireEvent.press(screen.getByLabelText("Place this order"));

    await waitFor(() =>
      expect(api.checkoutCart).toHaveBeenCalledWith("cart_1", {
        reference: "1234567890123",
        proofFileId: "file_proof",
      }),
    );
    expect(api.setCartFulfilment).not.toHaveBeenCalled();
    expect(mockReplace).toHaveBeenCalledWith({
      pathname: "/order/[id]",
      params: { id: "ord_1" },
    });
  });
});
