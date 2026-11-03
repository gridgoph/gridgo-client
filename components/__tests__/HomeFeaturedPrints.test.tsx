import { fireEvent, render, screen } from "@testing-library/react-native";
import { StyleSheet } from "react-native";

import { FEATURED_CARD_MIN_HEIGHT, FEATURED_MIN_HEIGHT, HomeFeaturedPrints } from "@/components/HomeFeaturedPrints";
import { featuredPrintsFrom } from "@/lib/homeSamples";
import { usePlatformSettings } from "@/store/platformSettings";

/**
 * Featured Prints is a still bento (Mark's option 5): the first card large,
 * the next two stacked beside it, nothing that scrolls or advances by itself.
 * It is also the part of Home that gives up height first, so Home fits a phone
 * with no vertical scroll (client#335). Jest does no layout, so these pin the
 * shape per card count, the floor, and that no scroll view is left.
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
    card("sci_blueprint", "Blueprint", "file_1"),
    card("sci_shirt", "Dri-fit shirt", "file_2"),
    card("sci_tarp", "Tarpaulin", "file_3"),
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

it("draws three or more cards as a bento: the first large, the next two stacked beside it", async () => {
  await render(<HomeFeaturedPrints samples={ALL} loading={false} onPick={jest.fn()} onSeeAll={jest.fn()} />);

  // Staff order; nothing past the third ("See all" is the rest).
  expect(tileNames()).toEqual(["Blueprint", "Dri-fit shirt", "Tarpaulin"]);
  expect(screen.getByTestId("featured-lead")).toContainElement(screen.getByTestId("featured-tile-sci_blueprint"));
  expect(screen.getByTestId("featured-stack")).toContainElement(screen.getByTestId("featured-tile-sci_shirt"));
  expect(screen.getByTestId("featured-stack")).toContainElement(screen.getByTestId("featured-tile-sci_tarp"));
  expect(screen.getByText("Featured prints")).toBeTruthy();
  expect(screen.getByRole("button", { name: "See all prints" })).toBeTruthy();
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

  expect(tileNames()).toEqual(["Blueprint", "Dri-fit shirt"]);
  expect(screen.queryByTestId("featured-stack")).toBeNull();
});

it("lets one card fill the block", async () => {
  await render(<HomeFeaturedPrints samples={ALL.slice(0, 1)} loading={false} onPick={jest.fn()} onSeeAll={jest.fn()} />);

  expect(tileNames()).toEqual(["Blueprint"]);
  expect(screen.queryByTestId("featured-lead")).toBeNull();
});

it("keeps the bento's shape while the list is loading", async () => {
  await render(<HomeFeaturedPrints samples={[]} loading onPick={jest.fn()} onSeeAll={jest.fn()} />);

  expect(screen.getByTestId("featured-waiting")).toBeTruthy();
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

it("shrinks only to a floor that still holds two small tiles' words", async () => {
  expect(FEATURED_MIN_HEIGHT).toBeLessThan(236);
  expect(FEATURED_MIN_HEIGHT).toBeGreaterThan(FEATURED_CARD_MIN_HEIGHT * 2);

  await render(<HomeFeaturedPrints samples={ALL} loading={false} onPick={jest.fn()} onSeeAll={jest.fn()} />);
  const block = StyleSheet.flatten(screen.getByTestId("featured-prints").props.style);
  expect(block.minHeight).toBe(FEATURED_MIN_HEIGHT);
});

// One press per file, and it goes last (AGENTS.md, "Running and testing").
it("opens the tapped print", async () => {
  const onPick = jest.fn();
  await render(<HomeFeaturedPrints samples={ALL} loading={false} onPick={onPick} onSeeAll={jest.fn()} />);

  fireEvent.press(screen.getByTestId("featured-tile-sci_tarp"));

  expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ id: "sci_tarp" }));
});
