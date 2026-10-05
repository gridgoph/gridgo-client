import { render } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import type { Cart, CartLineRecord, CatalogItem, PlatformSettings } from "@/lib/api";
import { withQuote, type QuoteOptions } from "@/test/cartQuote";

/** A basket the checkout screen can draw: one Flyers line at GRIDGO's ₱44. */
export const CHECKOUT_SETTINGS: PlatformSettings = {
  issueWindowHours: 24,
  serviceFeeRateBps: 1000,
  deliveryFeeBands: [{ maxDistanceMeters: null, feeMinor: 2500 }],
  downpaymentPercent: 100,
};

export const HOME = { lat: 7.076, lng: 125.615, label: "12 Quimpo Blvd, Talomo" };

export function checkoutListing(overrides: Partial<CatalogItem> = {}): CatalogItem {
  return {
    id: "sci_flyers", supplierId: "user_shop", supplierServiceId: "svc",
    categoryCode: "marketing_collateral", subcategoryCode: "flyers", name: "Flyers", description: null,
    basePriceMinor: 4000, fromPriceMinor: 4000, effectivePriceMinor: 4000,
    clientFromPriceMinor: 4400, clientEffectivePriceMinor: 4400,
    pricingUnit: "per_package", packageQty: 100, measurementKind: "none", measureUnit: null,
    minimumWidthMilli: null, minimumHeightMilli: null, minimumLengthMilli: null, minimumOrderQuantity: null,
    priceTiers: [], speedTiers: [], pricingBasis: "per_unit", turnaroundMode: "override", turnaroundHours: 48,
    rush: null, acceptedFormats: [], photos: [], prepSteps: [], optionGroups: [], version: 1, serviceVersion: 1,
    ...overrides,
  };
}

export function checkoutLine(overrides: Partial<CartLineRecord> = {}): CartLineRecord {
  return {
    id: "cline_1", supplierId: "user_shop", catalogItemId: "sci_flyers", quantity: 1, optionIds: [],
    measurement: null, structuredSpec: {}, artworkFileId: "file_art", mockupFileId: null, dropoff: null,
    sortOrder: 0, listing: checkoutListing(), lineSubtotalMinor: 4000, clientLineSubtotalMinor: 4400,
    ...overrides,
  };
}

export function checkoutCart(overrides: Partial<Cart> = {}, quote: QuoteOptions = { downpaymentPercent: 100 }): Cart {
  return withQuote(
    {
      id: "cart_1", state: "draft", version: 1, serviceLevel: "standard", scheduledFor: null,
      fulfillmentMode: "delivery", defaultDropoff: HOME, lines: [checkoutLine()], checkedOutOrderId: null,
      createdAt: "2026-10-05T00:00:00.000Z", updatedAt: "2026-10-05T00:00:00.000Z",
      ...overrides,
    },
    quote,
  );
}

export function renderInSafeArea(ui: ReactElement) {
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
