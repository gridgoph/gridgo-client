import { render, screen } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import CheckoutScreen from "@/app/checkout";
import type { Cart, CartLineRecord, PlatformSettings } from "@/lib/api";
import { useCart } from "@/store/cart";

const mockProof = {
  state: {
    phase: "stored" as const,
    fileName: "receipt.jpg",
    fileId: "file_proof",
    progress: 1,
    error: null,
  },
  ocr: { status: "filled" as const, reference: "1234567890123" as string | null },
  pick: jest.fn(),
  reset: jest.fn(),
};

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
    checkoutCart: jest.fn(),
  };
});

jest.mock("@/hooks/usePaymentProof", () => ({
  usePaymentProof: () => mockProof,
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require("@/lib/api");

const SETTINGS: PlatformSettings = {
  issueWindowHours: 24,
  serviceFeeRateBps: 1000,
  deliveryFeeBands: [{ maxDistanceMeters: null, feeMinor: 2500 }],
};

function cart(): Cart {
  const line: CartLineRecord = {
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
    listing: {
      id: "sci_flyers",
      name: "Flyers",
      supplierId: "user_lovis",
      fromPriceMinor: 2500,
      effectivePriceMinor: 4000,
      selectedOptions: [{ id: "o_a4", label: "A4" }],
    } as never,
    lineSubtotalMinor: 4000,
  };
  return {
    id: "cart_1",
    state: "draft",
    version: 1,
    serviceLevel: "standard",
    scheduledFor: null,
    fulfillmentMode: "delivery",
    defaultDropoff: { lat: 7.076, lng: 125.615, label: "12 Quimpo Blvd, Talomo" },
    lines: [line],
    checkedOutOrderId: null,
    createdAt: "2026-08-24T00:00:00.000Z",
    updatedAt: "2026-08-24T00:00:00.000Z",
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

describe("checkout OCR fill", () => {
  beforeEach(() => {
    mockProof.ocr = { status: "filled", reference: "1234567890123" };
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
    useCart.setState({
      cartId: "cart_1",
      cart: cart(),
      loading: false,
      busy: false,
      error: null,
      hydrated: true,
    });
  });

  it("fills Payment reference from a successful receipt read", async () => {
    await renderInSafeArea(<CheckoutScreen />);
    await screen.findByText("WHAT GRIDGO IS PRINTING");

    expect(screen.getByLabelText("Payment reference").props.value).toBe("1234567890123");
  });
});
