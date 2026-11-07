import { render } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import ListingScreen from "@/app/request/listing";
import type { CatalogItem } from "@/lib/api";
import { reorderAnswers } from "@/lib/reorder";
import { useReorderJob, type ReorderFile } from "@/store/reorderJob";
import { CURRENT_FLOW_ORDER } from "@/test/reorderFixtures";

/** Shared by the listing's reorder tests, split one press per file. */

export function reorderFlyers(overrides: Partial<CatalogItem> = {}): CatalogItem {
  return {
    id: "sci_flyers",
    supplierId: "user_shop",
    supplierServiceId: "svc",
    categoryCode: "marketing_collateral",
    subcategoryCode: "flyers",
    name: "Flyers",
    description: "",
    basePriceMinor: 2200,
    fromPriceMinor: 2200,
    effectivePriceMinor: null,
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
    turnaroundHours: 12,
    rush: null,
    acceptedFormats: [],
    photos: [],
    prepSteps: [],
    optionGroups: [
      {
        id: "grp_paper",
        name: "Paper",
        kind: "spec",
        helpText: null,
        required: true,
        selectionMode: "single",
        sortOrder: 0,
        version: 1,
        options: [
          { id: "opt_gloss", label: "Gloss", priceModifierMinor: 0, specBinding: null, sortOrder: 0 },
          { id: "opt_matte", label: "Matte", priceModifierMinor: 0, specBinding: null, sortOrder: 1 },
        ],
      },
    ],
    version: 1,
    serviceVersion: 1,
    ...overrides,
  } as CatalogItem;
}

export function renderSheet() {
  return render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 47, left: 0, right: 0, bottom: 34 },
      }}
    >
      <ListingScreen />
    </SafeAreaProvider>,
  );
}

export function startReorderJob(
  fields: { subcategory?: string; quantity?: number; files?: ReorderFile[] | null; lineId?: string | null } = {},
): number {
  return useReorderJob.getState().start({
    subcategory: fields.subcategory ?? "flyers",
    answers: { ...reorderAnswers(CURRENT_FLOW_ORDER), quantity: fields.quantity ?? 2 },
    files: fields.files ?? null,
    lineId: fields.lineId ?? null,
    artworkNote: null,
  });
}
