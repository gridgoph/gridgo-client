import { fireEvent, render, screen } from "@testing-library/react-native";
import { StyleSheet } from "react-native";

import { HomeFeaturedPrints } from "@/components/HomeFeaturedPrints";
import { pagePadding } from "@/constants/theme";
import {
  FEATURED_GAP,
  featuredCardWidth,
  featuredImageHeight,
  featuredPrintsFrom,
  featuredSnapInterval,
} from "@/lib/homeSamples";
import { usePlatformSettings } from "@/store/platformSettings";

/**
 * Featured Prints is a horizontal peek carousel: every curated product, as
 * uniform 3:4 portrait cards with the name and starting price under the photo,
 * about 2.3 cards at rest, snapping card by card. Nothing moves by itself.
 */

function card(id: string, name: string, fileId: string | null, pricingUnit = "per_unit") {
  return {
    id,
    name,
    categoryCode: "marketing_collateral",
    subcategoryCode: id,
    clientFromPriceMinor: 49_500,
    pricingUnit,
    photos: fileId
      ? [{ fileId, sortOrder: 0, url: `/catalog/media/${fileId}`, downloadUrl: `https://storage.example/${fileId}` }]
      : [],
  };
}

const ALL = featuredPrintsFrom({
  items: [
    card("sci_blueprint_blue", "Digital Blueprint (Blue Paper)", "file_1", "per_page"),
    card("sci_blueprint_white", "Digital Blueprint (White Paper)", "file_2", "per_page"),
    card("sci_whiteprint", "Whiteprint", "file_3"),
    card("sci_flyers", "Flyers", "file_4"),
  ],
});

/** jest-expo's window is 750 wide; Home's card math reads it like a phone's. */
const WIDTH = featuredCardWidth(750);

beforeEach(() => {
  usePlatformSettings.getState().reset();
  usePlatformSettings.getState().adopt({
    issueWindowHours: 24,
    serviceFeeRateBps: 1000,
    deliveryFeeBands: [{ maxDistanceMeters: null, feeMinor: 2500 }],
  });
});

const tileNames = () =>
  screen.queryAllByRole("button", { name: /, from / }).map((tile) => String(tile.props.accessibilityLabel).split(",")[0]);

it("draws every curated print in staff order, not just the first two", async () => {
  await render(<HomeFeaturedPrints samples={ALL} loading={false} onPick={jest.fn()} onSeeAll={jest.fn()} />);

  expect(tileNames()).toEqual([
    "Digital Blueprint (Blue Paper)",
    "Digital Blueprint (White Paper)",
    "Whiteprint",
    "Flyers",
  ]);
  expect(screen.getByText("Featured prints")).toBeTruthy();
  expect(screen.getByRole("button", { name: "See all prints" })).toBeTruthy();
});

it("is a horizontal row that snaps card by card, with no scroll bar", async () => {
  await render(<HomeFeaturedPrints samples={ALL} loading={false} onPick={jest.fn()} onSeeAll={jest.fn()} />);

  const row = screen.getByTestId("featured-row");
  expect(row.props.horizontal).toBe(true);
  expect(row.props.snapToInterval).toBe(featuredSnapInterval(WIDTH));
  expect(row.props.snapToAlignment).toBe("start");
  expect(row.props.decelerationRate).toBe("fast");
  expect(row.props.showsHorizontalScrollIndicator).toBe(false);

  // Edge to edge, padded back in so the first card sits on Home's page padding.
  expect(StyleSheet.flatten(row.props.style)).toMatchObject({ marginHorizontal: -pagePadding });
  expect(StyleSheet.flatten(row.props.contentContainerStyle)).toMatchObject({
    paddingHorizontal: pagePadding,
    gap: FEATURED_GAP,
  });
});

it("cuts every card the same 3:4 portrait, and puts a one-line name and the price under the photo", async () => {
  await render(<HomeFeaturedPrints samples={ALL} loading={false} onPick={jest.fn()} onSeeAll={jest.fn()} />);

  for (const sample of ALL) {
    expect(StyleSheet.flatten(screen.getByTestId(`featured-tile-${sample.id}`).props.style)).toMatchObject({ width: WIDTH });
    expect(StyleSheet.flatten(screen.getByTestId(`featured-image-${sample.id}`).props.style)).toEqual({
      width: WIDTH,
      height: featuredImageHeight(WIDTH),
    });
    const title = screen.getByTestId(`featured-title-${sample.id}`);
    expect(title.props.numberOfLines).toBe(1);
    expect(title.props.ellipsizeMode).toBe("tail");
  }

  // The price line is in flow under the photo, in the section's own unit words.
  expect(screen.getAllByText("₱495.00 per page")).toHaveLength(2);
  expect(screen.getAllByText("₱495.00 each")).toHaveLength(2);
  // Nothing is laid over the photo any more.
  expect(screen.queryByTestId("featured-price-badge-sci_blueprint_blue")).toBeNull();
});

it("labels each card as one button with its name and starting price", async () => {
  await render(<HomeFeaturedPrints samples={ALL} loading={false} onPick={jest.fn()} onSeeAll={jest.fn()} />);

  expect(screen.getByRole("button", { name: "Digital Blueprint (Blue Paper), from ₱495.00 per page" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Flyers, from ₱495.00 each" })).toBeTruthy();
});

it("holds three skeleton cards of the same shape while the list is loading", async () => {
  await render(<HomeFeaturedPrints samples={[]} loading onPick={jest.fn()} onSeeAll={jest.fn()} />);

  const waiting = screen.getByTestId("featured-waiting");
  expect(waiting.children).toHaveLength(3);
  expect(StyleSheet.flatten(waiting.props.style)).toMatchObject({ marginHorizontal: -pagePadding });
  expect(tileNames()).toEqual([]);
});

it("fills the photo box with a placeholder until it paints, caches by file id, and keeps a card with no photo", async () => {
  const withoutPhoto = featuredPrintsFrom({ items: [card("sci_blueprint", "Blueprint", "file_1"), card("sci_cards", "Cards", null)] });
  await render(<HomeFeaturedPrints samples={withoutPhoto} loading={false} onPick={jest.fn()} onSeeAll={jest.fn()} />);

  const photos = screen.getAllByTestId("sample-photo-image");
  expect(photos).toHaveLength(1);
  expect(photos[0].props.source[0]).toMatchObject({ uri: "https://storage.example/file_1", cacheKey: "file_1" });
  expect(photos[0].props.recyclingKey).toBe("sci_blueprint");
  expect(screen.getByTestId("featured-photo-loading-sci_blueprint")).toBeTruthy();
  expect(screen.getByTestId("featured-photo-missing-sci_cards")).toBeTruthy();
  expect(tileNames()).toEqual(["Blueprint", "Cards"]);
});

it("takes its own height rather than a fixed floor, so larger text pushes Home down instead of clipping", async () => {
  await render(<HomeFeaturedPrints samples={ALL} loading={false} onPick={jest.fn()} onSeeAll={jest.fn()} />);

  const block = StyleSheet.flatten(screen.getByTestId("featured-prints").props.style);
  expect(block).toEqual({ flexGrow: 1, flexShrink: 0 });
});

// One press per file, and it goes last (AGENTS.md, "Running and testing").
it("opens the tapped print", async () => {
  const onPick = jest.fn();
  await render(<HomeFeaturedPrints samples={ALL} loading={false} onPick={onPick} onSeeAll={jest.fn()} />);

  fireEvent.press(screen.getByTestId("featured-tile-sci_flyers"));

  expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ id: "sci_flyers" }));
});
