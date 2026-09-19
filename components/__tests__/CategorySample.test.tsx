import { render, screen } from "@testing-library/react-native";
import { Dimensions } from "react-native";

import { CategorySampleCard, sampleCardSlots } from "@/components/CategorySample";
import { spacing, typography } from "@/constants/theme";
import type { CatalogItem } from "@/lib/api";
import type { ProductSubcategory } from "@/lib/productCategories";
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

function subcategory(name: string): ProductSubcategory {
  return { code: "flyers", name, examples: "Single sheets, event promos", productFamilyIds: [] };
}

function listing(): CatalogItem {
  return {
    id: "sci_1",
    supplierId: "user_shop",
    supplierServiceId: "svc",
    categoryCode: "marketing_collateral",
    subcategoryCode: "flyers",
    name: "Flyers",
    description: null,
    basePriceMinor: 40_000,
    fromPriceMinor: 40_000,
    effectivePriceMinor: null,
    pricingUnit: "per_unit",
    packageQty: null,
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
  };
}

/** The text size this phone is set to. Every reservation is cut from it. */
const { fontScale } = Dimensions.get("window");

/**
 * These cards stand side by side, so a one-word name and a name that wraps
 * must not produce two different card heights — the prices under them have to
 * line up. And no reservation may cut a glyph: React Native scales type by the
 * phone's own text size, so the boxes have to scale with it.
 */
describe("CategorySampleCard", () => {
  it("reserves the same two lines for a short name as for a long one", async () => {
    await render(
      <CategorySampleCard
        subcategory={subcategory("Flyers")}
        listing={listing()}
        onPress={() => undefined}
      />,
    );

    const name = screen.getByText("Flyers");
    expect(name.props.numberOfLines).toBe(2);
    expect(screen.getByTestId("sample-card-name").props.style).toEqual(
      expect.objectContaining({ height: sampleCardSlots(fontScale, true).name }),
    );
  });

  /**
   * The name is only today's variable. A subcategory published with no example
   * line, or a listing with no price, would drop a line and start the ragged
   * edge again — so the block itself is reserved too.
   */
  it("holds the card's height when a line is missing", async () => {
    const bare: ProductSubcategory = { ...subcategory("Flyers"), examples: "" };
    await render(
      <CategorySampleCard subcategory={bare} listing={null} onPress={() => undefined} />,
    );

    expect(screen.getByTestId("sample-card-copy").props.style).toEqual(
      expect.objectContaining({ height: sampleCardSlots(fontScale, true).copy }),
    );
  });

  it("keeps the wrapping name to the same two lines", async () => {
    await render(
      <CategorySampleCard
        subcategory={subcategory("Corporate giveaways and merchandise")}
        listing={listing()}
        onPress={() => undefined}
      />,
    );

    const name = screen.getByText("Corporate giveaways and merchandise");
    expect(name.props.numberOfLines).toBe(2);
    expect(screen.getByTestId("sample-card-name").props.style).toEqual(
      expect.objectContaining({ height: sampleCardSlots(fontScale, true).name }),
    );
  });

  it("gives examples two lines so the rest of the line is not dropped", async () => {
    await render(
      <CategorySampleCard
        subcategory={subcategory("Flyers")}
        listing={listing()}
        onPress={() => undefined}
      />,
    );

    const examples = screen.getByText("Single sheets, event promos");
    expect(examples.props.numberOfLines).toBe(2);
  });

  it("puts the peso amount and its unit on two lines so the unit is not cut", async () => {
    await render(
      <CategorySampleCard
        subcategory={subcategory("Flyers")}
        listing={listing()}
        onPress={() => undefined}
      />,
    );

    // GRIDGO's price: the shop's PHP 400.00 plus GRIDGO's 10%.
    expect(screen.getByText("From ₱440.00")).toBeTruthy();
    expect(screen.queryByText(/₱400/)).toBeNull();
    expect(screen.getByText("each")).toBeTruthy();
  });

  it("draws no figure at all while GRIDGO's rate is unread", async () => {
    usePlatformSettings.getState().reset();
    await render(
      <CategorySampleCard
        subcategory={subcategory("Flyers")}
        listing={listing()}
        onPress={() => undefined}
      />,
    );

    expect(screen.queryByText(/₱/)).toBeNull();
  });

  /**
   * The reported bug: the reservations were raw design numbers, so a client who
   * had turned text up read "per pack of 100" with its bottom half cut away.
   */
  it("reserves the copy block in the phone's text size, not the design's", () => {
    const design =
      typography.body.lineHeight * 2 +
      typography.caption.lineHeight * 2 +
      typography.body.lineHeight +
      typography.caption.lineHeight;

    expect(sampleCardSlots(2, true).copy).toBe(design * 2 + spacing.xs * 2);
    expect(sampleCardSlots(1, true).copy).toBe(design + spacing.xs * 2);
    // Text turned down keeps the design's own rhythm rather than shrinking.
    expect(sampleCardSlots(0.85, true).copy).toBe(design + spacing.xs * 2);
  });

  /** Home's strip leaves the contents line to the board underneath it. */
  it("drops the examples slot when the contents line is left off", async () => {
    await render(
      <CategorySampleCard
        subcategory={subcategory("Flyers")}
        listing={listing()}
        showExamples={false}
        onPress={() => undefined}
      />,
    );

    expect(screen.queryByText("Single sheets, event promos")).toBeNull();
    expect(screen.getByTestId("sample-card-copy").props.style).toEqual(
      expect.objectContaining({ height: sampleCardSlots(fontScale, false).copy }),
    );
  });
});
