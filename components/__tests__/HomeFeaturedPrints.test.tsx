import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { StyleSheet } from "react-native";

import { FEATURED_CARD_MIN_HEIGHT, FEATURED_MIN_HEIGHT, HomeFeaturedPrints } from "@/components/HomeFeaturedPrints";
import { featuredPrintsFrom } from "@/lib/homeSamples";
import { usePlatformSettings } from "@/store/platformSettings";

/**
 * Featured Prints is the part of Home that gives up height first, so Home
 * fits a phone with no vertical scroll (client#335). Jest does no layout, so
 * these pin the two things the fit depends on: the cards follow whatever
 * height the pager is given, and nothing in the swipe row can size the pager.
 */

const SAMPLES = featuredPrintsFrom({
  items: [
    {
      id: "sci_flyers",
      name: "Flyers",
      categoryCode: "marketing_collateral",
      subcategoryCode: "flyers",
      clientFromPriceMinor: 49_500,
      pricingUnit: "per_unit",
      photos: [{ fileId: "file_1", sortOrder: 0, url: "/catalog/media/file_1", downloadUrl: "https://storage.example/file_1" }],
    },
    {
      id: "sci_cards",
      name: "Business cards",
      categoryCode: "marketing_collateral",
      subcategoryCode: "business_cards",
      clientFromPriceMinor: 72_500,
      pricingUnit: "per_unit",
      photos: [],
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

function cardHeight(name: RegExp) {
  return StyleSheet.flatten(screen.getByRole("button", { name }).props.style).height;
}

function layOut(height: number) {
  fireEvent(screen.getByTestId("featured-pager"), "layout", {
    nativeEvent: { layout: { x: 0, y: 0, width: 326, height } },
  });
}

it("lays the swipe row out of flow, so the cards can never hold the pager open", async () => {
  await render(<HomeFeaturedPrints samples={SAMPLES} loading={false} onPick={jest.fn()} onSeeAll={jest.fn()} />);

  // The pager takes the block's leftover height (flex) and nothing else.
  const row = screen.getByTestId("featured-row");
  expect(StyleSheet.flatten(row.props.style)).toMatchObject({ position: "absolute", top: 0, bottom: 0 });

  // A short phone: the pager is given 96, and the cards shrink to it.
  layOut(96);
  await waitFor(() => expect(cardHeight(/^Flyers, from/)).toBe(96));
  expect(cardHeight(/^Business cards, from/)).toBe(96);
});

it("lets the block shrink well below its old 236 floor, but never clips a card's words", async () => {
  expect(FEATURED_MIN_HEIGHT).toBeLessThan(236);
  expect(FEATURED_MIN_HEIGHT).toBeGreaterThan(FEATURED_CARD_MIN_HEIGHT);

  await render(<HomeFeaturedPrints samples={SAMPLES} loading={false} onPick={jest.fn()} onSeeAll={jest.fn()} />);
  expect(StyleSheet.flatten(screen.getByTestId("featured-prints").props.style).minHeight).toBe(FEATURED_MIN_HEIGHT);

  // Squeezed past the floor, a card keeps its name, unit and price.
  layOut(40);
  await waitFor(() => expect(cardHeight(/^Flyers, from/)).toBe(FEATURED_CARD_MIN_HEIGHT));
});
