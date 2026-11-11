import { fireEvent, render, screen } from "@testing-library/react-native";
import { StyleSheet } from "react-native";

import {
  FEATURED_CARD_MIN_HEIGHT,
  FEATURED_MIN_HEIGHT,
  FEATURED_TITLE_MIN_HEIGHT,
  HomeFeaturedPrints,
  sharedFeaturedTitleHeight,
} from "@/components/HomeFeaturedPrints";
import { featuredPrintsFrom } from "@/lib/homeSamples";
import { usePlatformSettings } from "@/store/platformSettings";

/**
 * Featured Prints is a symmetric two-column grid on Home's centre axis: equal
 * card widths and heights, aligned price badges and title slots, and full
 * wrapped product names with no truncation. Nothing scrolls or advances by
 * itself, and the block shrinks first on a small phone (client#335).
 */

function card(id: string, name: string, fileId: string | null) {
  return {
    id,
    name,
    categoryCode: "marketing_collateral",
    subcategoryCode: id,
    clientFromPriceMinor: 49_500,
    pricingUnit: "per_unit",
    photos: fileId
      ? [{ fileId, sortOrder: 0, url: `/catalog/media/${fileId}`, downloadUrl: `https://storage.example/${fileId}` }]
      : [],
  };
}

const ALL = featuredPrintsFrom({
  items: [
    card("sci_blueprint_blue", "Digital Blueprint (Blue Paper)", "file_1"),
    card("sci_blueprint_white", "Digital Blueprint (White Paper)", "file_2"),
    card("sci_whiteprint", "Whiteprint", "file_3"),
    card("sci_flyers", "Flyers", "file_4"),
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

const tileNames = () =>
  screen.queryAllByRole("button", { name: /, from / }).map((tile) => String(tile.props.accessibilityLabel).split(",")[0]);

it("draws two or more curated prints as equal-size twin cards with aligned badges and unwrapped titles", async () => {
  await render(<HomeFeaturedPrints samples={ALL} loading={false} onPick={jest.fn()} onSeeAll={jest.fn()} />);

  // Staff order, symmetric pair on Home's 50% axis; "See all" opens the rest.
  expect(tileNames()).toEqual(["Digital Blueprint (Blue Paper)", "Digital Blueprint (White Paper)"]);
  expect(screen.queryByTestId("featured-lead")).toBeNull();
  expect(screen.queryByTestId("featured-stack")).toBeNull();
  expect(screen.getByText("Featured prints")).toBeTruthy();
  expect(screen.getByRole("button", { name: "See all prints" })).toBeTruthy();

  const leftCol = StyleSheet.flatten(screen.getByTestId("featured-col-sci_blueprint_blue").props.style);
  const rightCol = StyleSheet.flatten(screen.getByTestId("featured-col-sci_blueprint_white").props.style);
  expect(leftCol).toEqual({ minWidth: 0, flexBasis: 0 });
  expect(rightCol).toEqual({ minWidth: 0, flexBasis: 0 });

  const leftTile = screen.getByTestId("featured-tile-sci_blueprint_blue");
  const rightTile = screen.getByTestId("featured-tile-sci_blueprint_white");
  expect(typeof leftTile.props.style).not.toBe("function");
  expect(typeof rightTile.props.style).not.toBe("function");
  expect(StyleSheet.flatten(leftTile.props.style)).toEqual(StyleSheet.flatten(rightTile.props.style));

  // Long titles wrap rather than truncating with ellipsis, and share an aligned title slot.
  const leftTitle = screen.getByTestId("featured-title-sci_blueprint_blue");
  const rightTitle = screen.getByTestId("featured-title-sci_blueprint_white");
  expect(leftTitle.props.numberOfLines).toBeUndefined();
  expect(rightTitle.props.numberOfLines).toBeUndefined();
  expect(StyleSheet.flatten(leftTitle.props.style)).toEqual(StyleSheet.flatten(rightTitle.props.style));

  const leftSlot = StyleSheet.flatten(screen.getByTestId("featured-title-slot-sci_blueprint_blue").props.style);
  const rightSlot = StyleSheet.flatten(screen.getByTestId("featured-title-slot-sci_blueprint_white").props.style);
  expect(leftSlot.minHeight).toBe(FEATURED_TITLE_MIN_HEIGHT);
  expect(rightSlot.minHeight).toBe(FEATURED_TITLE_MIN_HEIGHT);

  expect(screen.getByTestId("featured-price-badge-sci_blueprint_blue")).toBeTruthy();
  expect(screen.getByTestId("featured-price-badge-sci_blueprint_white")).toBeTruthy();
});

it("wires sharedFeaturedTitleHeight to return the tallest title measurement above the 40pt floor", () => {
  expect(sharedFeaturedTitleHeight([20, 20])).toBe(FEATURED_TITLE_MIN_HEIGHT);
  expect(sharedFeaturedTitleHeight([52, 26])).toBe(52);
  expect(sharedFeaturedTitleHeight([80, 40])).toBe(80);
});

it("has nothing that moves by itself: no scroll view, no page dots", async () => {
  await render(<HomeFeaturedPrints samples={ALL} loading={false} onPick={jest.fn()} onSeeAll={jest.fn()} />);

  const tree = JSON.stringify(screen.toJSON());
  expect(tree).not.toContain("snapToInterval");
  expect(tree).not.toContain('"horizontal":true');
  expect(screen.queryByTestId("featured-row")).toBeNull();
  expect(screen.queryByTestId("featured-pager")).toBeNull();
});

it("sits two cards side by side", async () => {
  await render(<HomeFeaturedPrints samples={ALL.slice(0, 2)} loading={false} onPick={jest.fn()} onSeeAll={jest.fn()} />);

  expect(tileNames()).toEqual(["Digital Blueprint (Blue Paper)", "Digital Blueprint (White Paper)"]);
});

it("lets one card fill the block", async () => {
  await render(<HomeFeaturedPrints samples={ALL.slice(0, 1)} loading={false} onPick={jest.fn()} onSeeAll={jest.fn()} />);

  expect(tileNames()).toEqual(["Digital Blueprint (Blue Paper)"]);
  expect(screen.getByTestId("featured-col-sci_blueprint_blue")).toBeTruthy();
});

it("keeps the symmetric pair shape while the list is loading", async () => {
  await render(<HomeFeaturedPrints samples={[]} loading onPick={jest.fn()} onSeeAll={jest.fn()} />);

  const waiting = screen.getByTestId("featured-waiting");
  expect(waiting.children).toHaveLength(2);
  expect(tileNames()).toEqual([]);
});

it("caches each photo by its file id, and keeps a tile with no photo", async () => {
  const withoutPhoto = featuredPrintsFrom({ items: [card("sci_blueprint", "Blueprint", "file_1"), card("sci_cards", "Cards", null)] });
  await render(<HomeFeaturedPrints samples={withoutPhoto} loading={false} onPick={jest.fn()} onSeeAll={jest.fn()} />);

  const photos = screen.getAllByTestId("sample-photo-image");
  expect(photos).toHaveLength(1);
  expect(photos[0].props.source[0]).toMatchObject({ uri: "https://storage.example/file_1", cacheKey: "file_1" });
  expect(photos[0].props.recyclingKey).toBe("sci_blueprint");
  expect(tileNames()).toEqual(["Blueprint", "Cards"]);
});

it("fits Home's 1.0x no-scroll budget while holding both badge and two-line title", async () => {
  expect(FEATURED_MIN_HEIGHT).toBeLessThan(236);
  expect(FEATURED_MIN_HEIGHT).toBeGreaterThan(FEATURED_CARD_MIN_HEIGHT);

  await render(<HomeFeaturedPrints samples={ALL} loading={false} onPick={jest.fn()} onSeeAll={jest.fn()} />);
  const block = StyleSheet.flatten(screen.getByTestId("featured-prints").props.style);
  expect(block.minHeight).toBe(FEATURED_MIN_HEIGHT);
});

// One press per file, and it goes last (AGENTS.md, "Running and testing").
it("opens the tapped print", async () => {
  const onPick = jest.fn();
  await render(<HomeFeaturedPrints samples={ALL} loading={false} onPick={onPick} onSeeAll={jest.fn()} />);

  fireEvent.press(screen.getByTestId("featured-tile-sci_blueprint_white"));

  expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ id: "sci_blueprint_white" }));
});
