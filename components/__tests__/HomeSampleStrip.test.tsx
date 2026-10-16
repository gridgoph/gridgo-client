import { render, screen } from "@testing-library/react-native";
import { Dimensions } from "react-native";

import { HomeSampleStrip } from "@/components/HomeSampleStrip";
import { homeSampleCardWidth } from "@/lib/homeSamples";
import type { HomeSample } from "@/lib/homeSamples";
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

/** A curated card: GRIDGO's price already inside, no shop figure at all. */
function sample(id: string): HomeSample {
  return {
    id,
    name: "Calling cards",
    categoryCode: "marketing_collateral",
    subcategoryCode: "business_cards",
    clientFromPriceMinor: 44_000,
    pricingUnit: "per_package",
    packageQty: 100,
    measureUnit: null,
    minimumOrderQuantity: null,
    photos: [],
  };
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

  it("draws GRIDGO's price as sent, and never the shop that listed it", async () => {
    await render(
      <HomeSampleStrip samples={[sample("sci_1")]} loading={false} onPick={() => undefined} />,
    );

    expect(screen.getByText("Calling cards")).toBeTruthy();
    // Already fee-inclusive: marking it up again would read ₱484.00.
    expect(screen.getByText("From ₱440.00")).toBeTruthy();
    expect(screen.queryByText(/₱484/)).toBeNull();
    expect(screen.getByText("per pack of 100")).toBeTruthy();
    expect(screen.queryByText(/Shop/)).toBeNull();
  });
});
