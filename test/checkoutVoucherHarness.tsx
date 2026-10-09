import { render } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import type { Cart, CartLineRecord, PlatformSettings } from "@/lib/api";
import { withQuote } from "@/test/cartQuote";

/**
 * A one-line basket for the checkout voucher tests: ₱40 flyers at a 10% fee
 * is ₱44 printing, plus ₱25 delivery, ₱69 in all, paid in full.
 */
export const VOUCHER_SETTINGS: PlatformSettings = {
  issueWindowHours: 24,
  serviceFeeRateBps: 1000,
  downpaymentPercent: 100,
  deliveryFeeBands: [{ maxDistanceMeters: null, feeMinor: 2500 }],
};

function line(): CartLineRecord {
  return {
    id: "cline_1",
    supplierId: "user_shop",
    catalogItemId: "sci_flyers",
    quantity: 1,
    optionIds: [],
    measurement: null,
    structuredSpec: {},
    artworkFileId: "file_art",
    mockupFileId: null,
    dropoff: null,
    sortOrder: 0,
    listing: {
      id: "sci_flyers",
      supplierId: "user_shop",
      supplierServiceId: "svc",
      categoryCode: "marketing_collateral",
      subcategoryCode: "flyers",
      name: "Flyers",
      description: null,
      basePriceMinor: 4000,
      fromPriceMinor: 4000,
      effectivePriceMinor: 4000,
      pricingUnit: "per_package",
      packageQty: 100,
      measurementKind: "none",
      measureUnit: null,
      minimumWidthMilli: null,
      minimumHeightMilli: null,
      minimumLengthMilli: null,
      minimumOrderQuantity: null,
      priceTiers: [],
      speedTiers: [],
      pricingBasis: "per_unit",
      turnaroundMode: "override",
      turnaroundHours: 48,
      rush: null,
      acceptedFormats: [],
      photos: [],
      prepSteps: [],
      optionGroups: [],
      version: 1,
      serviceVersion: 1,
    } as unknown as CartLineRecord["listing"],
    lineSubtotalMinor: 4000,
  };
}

export function voucherCart(): Cart {
  return withQuote(
    {
      id: "cart_1",
      state: "draft",
      version: 1,
      serviceLevel: "standard",
      scheduledFor: null,
      fulfillmentMode: "delivery",
      defaultDropoff: { lat: 7.07, lng: 125.6, label: "Sample drop-off, Davao City" },
      lines: [line()],
      checkedOutOrderId: null,
      createdAt: "2026-10-09T00:00:00.000Z",
      updatedAt: "2026-10-09T00:00:00.000Z",
    },
    { downpaymentPercent: 100 },
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
