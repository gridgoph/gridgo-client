import { render, screen } from "@testing-library/react-native";
import { Dimensions } from "react-native";

import { HomeSampleStrip } from "@/components/HomeSampleStrip";
import type { CatalogItem } from "@/lib/api";
import { homeSampleCardWidth } from "@/lib/homeSamples";
import type { HomeSample } from "@/lib/homeSamples";
import { PRODUCT_CATEGORY_SEED } from "@/data/productCategories";
import { usePlatformSettings } from "@/store/platformSettings";

const RATE_SETTINGS = {
  issueWindowHours: 24,
  serviceFeeRateBps: 1000,
  deliveryFeeBands: [{ maxDistanceMeters: null, feeMinor: 2500 }],
};

beforeEach(() => {
  usePlatformSettings.getState().reset();
  usePlatformSettings.getState().adopt(RATE_SETTINGS);
});

const category = PRODUCT_CATEGORY_SEED[0];

function sample(id: string): HomeSample {
  const subcategory = category.subcategories[0];
  const listing = {
    id,
    supplierId: "user_shop",
    supplierServiceId: "svc",
    categoryCode: category.code,
    subcategoryCode: subcategory.code,
    name: subcategory.name,
    description: null,
    basePriceMinor: 40_000,
    fromPriceMinor: 40_000,
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
    turnaroundHours: 48,
    rush: null,
    acceptedFormats: [],
    photos: [],
    prepSteps: [],
    optionGroups: [],
    version: 1,
    serviceVersion: 1,
  } satisfies CatalogItem;
  return { category, subcategory, listing };
}

/**
 * The shelf is only a shelf if something hangs over the edge of it. A card cut
 * to a fixed width filled the phone exactly, and two cards read as everything
 * GRIDGO prints.
 */
describe("HomeSampleStrip", () => {
  it("cuts every card to the width that leaves the next one peeking", async () => {
    const { width } = Dimensions.get("window");
    await render(
      <HomeSampleStrip
        samples={[sample("sci_1"), sample("sci_2"), sample("sci_3")]}
        loading={false}
        onPick={() => undefined}
      />,
    );

    const cards = screen.getAllByRole("button");
    expect(cards).toHaveLength(3);
    expect(homeSampleCardWidth(width)).toBeLessThan(width / 2);
  });

  it("carries the starting price, and never the shop that listed it", async () => {
    await render(
      <HomeSampleStrip samples={[sample("sci_1")]} loading={false} onPick={() => undefined} />,
    );

    expect(screen.getByText("From ₱440.00")).toBeTruthy();
    expect(screen.queryByText(/₱400/)).toBeNull();
    expect(screen.getByText("per pack of 100")).toBeTruthy();
    expect(screen.queryByText(/Shop/)).toBeNull();
  });
});
