import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { StyleSheet } from "react-native";

import { HomeFeaturedPrints } from "@/components/HomeFeaturedPrints";
import { featuredPrintsFrom } from "@/lib/homeSamples";
import { usePlatformSettings } from "@/store/platformSettings";

/**
 * Isolated single-event test (AGENTS.md, "Running and testing"): when one
 * featured title wraps taller at a larger font scale, both cards' title slots
 * expand to the same height so the bottom bands and prices stay aligned.
 */

const MIXED = featuredPrintsFrom({
  items: [
    {
      id: "sci_blueprint_blue",
      name: "Digital Blueprint (Blue Paper)",
      categoryCode: "marketing_collateral",
      subcategoryCode: "sci_blueprint_blue",
      clientFromPriceMinor: 4050,
      pricingUnit: "per_page",
      photos: [{ fileId: "file_1", sortOrder: 0, url: "/catalog/media/file_1", downloadUrl: "https://storage.example/file_1" }],
    },
    {
      id: "sci_whiteprint",
      name: "Whiteprint",
      categoryCode: "marketing_collateral",
      subcategoryCode: "sci_whiteprint",
      clientFromPriceMinor: 3375,
      pricingUnit: "per_page",
      photos: [{ fileId: "file_2", sortOrder: 0, url: "/catalog/media/file_2", downloadUrl: "https://storage.example/file_2" }],
    },
  ],
});

beforeEach(() => {
  usePlatformSettings.getState().reset();
  usePlatformSettings.getState().adopt({
    issueWindowHours: 24,
    serviceFeeRateBps: 1000,
    deliveryFeeBands: [{ maxDistanceMeters: null, feeMinor: 2500 }],
  });
});

it("aligns both cards' title slots when one title wraps taller at large font scale", async () => {
  await render(<HomeFeaturedPrints samples={MIXED} loading={false} onPick={jest.fn()} onSeeAll={jest.fn()} />);

  fireEvent(screen.getByTestId("featured-title-sci_blueprint_blue"), "layout", {
    nativeEvent: { layout: { width: 132, height: 64 } },
  });

  await waitFor(() => {
    const leftSlot = StyleSheet.flatten(screen.getByTestId("featured-title-slot-sci_blueprint_blue").props.style);
    const rightSlot = StyleSheet.flatten(screen.getByTestId("featured-title-slot-sci_whiteprint").props.style);
    expect(leftSlot.minHeight).toBe(64);
    expect(rightSlot.minHeight).toBe(64);
  });
});
