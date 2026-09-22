import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import CheckoutScreen from "@/app/checkout";
import type { Cart, CartLineRecord, PlatformSettings } from "@/lib/api";
import { useCart } from "@/store/cart";
import { useCheckoutPayment } from "@/store/checkoutPayment";

jest.mock("expo-router", () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    navigate: jest.fn(),
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
      phase: "empty",
      fileName: "",
      fileId: null,
      localUri: null,
      progress: null,
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
    id: "sci_docs",
    supplierId: "user_lovis",
    supplierServiceId: "svc",
    categoryCode: "documents_publications",
    subcategoryCode: "document_printing",
    name: "Document printing",
    description: null,
    basePriceMinor: 300,
    fromPriceMinor: 300,
    effectivePriceMinor: 300,
    pricingUnit: "per_page" as const,
    packageQty: null,
    measurementKind: "pages" as const,
    measureUnit: null,
    minimumWidthMilli: null,
    minimumHeightMilli: null,
    minimumLengthMilli: null,
    minimumOrderQuantity: null,
    priceTiers: [],
    speedTiers: [],
    pricingBasis: "per_page",
    turnaroundMode: "override" as const,
    turnaroundHours: 4,
    rush: null,
    acceptedFormats: [],
    photos: [],
    prepSteps: [],
    optionGroups: [],
    version: 1,
    serviceVersion: 1,
  };
}

function line(overrides: Partial<CartLineRecord> = {}): CartLineRecord {
  return {
    id: "cline_1",
    supplierId: "user_lovis",
    catalogItemId: "sci_docs",
    quantity: 2,
    optionIds: [],
    measurement: { pages: 30 },
    structuredSpec: { size: "A4" },
    artworkFileId: "file_art",
    mockupFileId: null,
    dropoff: null,
    sortOrder: 0,
    listing: listing(),
    lineSubtotalMinor: 18_000,
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
    fulfillmentMode: "pickup",
    defaultDropoff: null,
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

beforeEach(() => {
  useCheckoutPayment.getState().reset();
  api.getSettings.mockResolvedValue(SETTINGS);
  api.getCart.mockResolvedValue(cart());
  api.getCatalogShop.mockResolvedValue({
    supplierId: "user_lovis",
    shopName: "Lovis Printshop",
    shop: { lat: 7.0731, lng: 125.6128, label: "Bajada, Davao City" },
    media: [],
    categories: [],
    services: [],
  });
  api.listAddresses.mockResolvedValue([]);
  api.updateCartLine.mockImplementation(async (_id: string, _lineId: string, body: { quantity?: number }) => {
    return cart({
      lines: [line({ quantity: body.quantity ?? 2, lineSubtotalMinor: (body.quantity ?? 2) * 30 * 300 })],
    });
  });
  useCart.setState({
    cartId: "cart_1",
    cart: cart(),
    loading: false,
    busy: false,
    error: null,
    hydrated: true,
  });
});

it("changes copies only and leaves the page count on the line", async () => {
  await renderInSafeArea(<CheckoutScreen />);
  await screen.findByText("WHAT GRIDGO IS PRINTING");

  await fireEvent.press(screen.getByLabelText("One more Document printing"));

  await waitFor(() => {
    expect(api.updateCartLine).toHaveBeenCalledWith("cart_1", "cline_1", { quantity: 3 });
  });
  expect(api.updateCartLine).toHaveBeenCalledTimes(1);
  expect(api.updateCartLine.mock.calls[0][2]).not.toHaveProperty("measurement");
});
