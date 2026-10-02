import { fireEvent, render, screen } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import MatchScreen from "@/app/request/match";
import { SHOP_IDENTITY, otherListing, topListing, topPickMatch } from "@/test/matchFixtures";
import { PRODUCT_CATEGORY_SEED } from "@/data/productCategories";
import { clearMatchPrefetch } from "@/lib/matchPrefetch";
import { clearMatchSelections, matchSelectionFor } from "@/lib/matchSelection";
import { useCart } from "@/store/cart";
import { useOrderRanking } from "@/store/orderRanking";
import { usePriorities } from "@/store/priorities";

const mockPush = jest.fn();
const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockDismissTo = jest.fn();

jest.mock("expo-router", () => ({
  // The first-order tour registers its screen on focus (`useTourScreen`).
  useFocusEffect: () => undefined,
  useRouter: () => ({
    push: mockPush,
    back: mockBack,
    replace: mockReplace,
    dismissTo: mockDismissTo,
    canGoBack: () => true,
  }),
  useLocalSearchParams: () => ({
    subcategory: "tarpaulins_outdoor_banners",
    category: "marketing_collateral",
  }),
  Redirect: () => null,
}));

jest.mock("@/lib/api", () => {
  const actual = jest.requireActual("@/lib/api");
  const { PRODUCT_CATEGORY_SEED: seed } = jest.requireActual("@/data/productCategories");
  return {
    ...actual,
    productCategoriesNow: jest.fn(() => seed),
    getProductCategories: jest.fn(),
    matchShop: jest.fn(),
    matchNextShop: jest.fn(),
  };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require("@/lib/api");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { usePlatformSettings } = require("@/store/platformSettings");

function renderInSafeArea(ui: ReactElement) {
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

beforeEach(() => {
  mockPush.mockClear();
  mockBack.mockClear();
  mockReplace.mockClear();
  mockDismissTo.mockClear();
  api.productCategoriesNow.mockReturnValue(PRODUCT_CATEGORY_SEED);
  api.getProductCategories.mockResolvedValue(PRODUCT_CATEGORY_SEED);
  api.matchShop.mockReset();
  api.matchShop.mockResolvedValue(topPickMatch());
  api.matchNextShop.mockReset();
  clearMatchPrefetch();
  clearMatchSelections();
  useCart.getState().reset();
  useOrderRanking.getState().clear();
  usePlatformSettings.getState().reset();
  usePlatformSettings.getState().adopt({
    issueWindowHours: 24,
    serviceFeeRateBps: 1000,
    deliveryFeeBands: [{ maxDistanceMeters: null, feeMinor: 2500 }],
  });
  usePriorities.setState({ ranking: ["quality", "speed", "cost", "distance"], loaded: true });
});

describe("MatchScreen — the Top Pick (#154)", () => {
  it("leads with the Top Pick and the one reason GRIDGO matched on", async () => {
    await renderInSafeArea(<MatchScreen />);

    expect(await screen.findByText("TOP PICK")).toBeTruthy();
    expect(screen.getByText("MATCHED FOR QUALITY")).toBeTruthy();
    expect(screen.getByText("Tarpaulin Print")).toBeTruthy();
    // GRIDGO's price per unit: the shop's ₱20.00 plus GRIDGO's 10%.
    expect(screen.getByText("₱22.00 per sq ft")).toBeTruthy();
    expect(screen.queryByText(/₱20\.00/)).toBeNull();
    // The rating star and the zone word, never a distance on a near shop.
    expect(screen.getByText("4.3 (12)")).toBeTruthy();
    expect(screen.getAllByText("Nearby").length).toBeGreaterThan(0);
    // The queue place, large, and the client promise with how far off it is.
    expect(screen.getByText("YOUR PLACE")).toBeTruthy();
    expect(screen.getByText("4th")).toBeTruthy();
    expect(screen.getByText("READY BY")).toBeTruthy();
    expect(screen.getByText("Ready in 12 hours")).toBeTruthy();
  });

  it("dates the pick by its client promise, in Davao time", async () => {
    api.matchShop.mockResolvedValue(
      topPickMatch({ listings: [topListing("sci_lovis_tarp", { readyBy: "2026-10-12T02:58:00.000Z" })] }),
    );
    await renderInSafeArea(<MatchScreen />);

    expect(await screen.findByText("Mon, Oct 12, 2026 · 10:58 AM")).toBeTruthy();
  });

  it("draws the API's badge for whichever factor decided it", async () => {
    api.matchShop.mockResolvedValue(
      topPickMatch({ matchReason: { key: "vetted", label: "GRIDGO-Vetted Supplier" } }),
    );
    await renderInSafeArea(<MatchScreen />);

    expect(await screen.findByText("GRIDGO-VETTED SUPPLIER")).toBeTruthy();
    expect(screen.queryByText("MATCHED FOR QUALITY")).toBeNull();
  });

  it("says Out of Zone with its kilometres on the pick, and only there", async () => {
    api.matchShop.mockResolvedValue(
      topPickMatch({
        distanceZone: { key: "out_of_zone", label: "Out of Zone" },
        listings: [topListing("sci_far", { distanceKm: 16.4 })],
      }),
    );
    await renderInSafeArea(<MatchScreen />);

    expect(await screen.findByText("Out of Zone · 16.4 km")).toBeTruthy();
  });

  it("reads back the ranking it matched on, with Change into this job's re-rank", async () => {
    api.matchShop.mockResolvedValue(
      topPickMatch({ ranking: ["cost", "speed", "quality", "distance"] }),
    );
    await renderInSafeArea(<MatchScreen />);
    await screen.findByText("TOP PICK");

    expect(screen.getByText("MATCHED ON")).toBeTruthy();
    expect(screen.getByLabelText("1: Cost")).toBeTruthy();
    expect(screen.getByLabelText("2: Speed")).toBeTruthy();
    expect(screen.getByLabelText("3: Quality")).toBeTruthy();
    expect(screen.getByLabelText("4: Distance")).toBeTruthy();

    fireEvent.press(screen.getByLabelText("Change what GRIDGO matches on"));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/request/rank",
      params: {
        subcategory: "tarpaulins_outdoor_banners",
        category: "marketing_collateral",
        returnTo: "match",
      },
    });
  });

  it("matches on the usual order when the job was not re-ranked, with no basket bound", async () => {
    useCart.setState({ cartId: "cart_held" });
    await renderInSafeArea(<MatchScreen />);
    await screen.findByText("TOP PICK");

    const sent = api.matchShop.mock.calls[0][0];
    expect(sent).toMatchObject({ subcategoryCode: "tarpaulins_outdoor_banners" });
    // A skipped confirm sends no ranking: GRIDGO reads the saved one.
    expect(sent).not.toHaveProperty("ranking");
    // A pick token bound to a basket is refused by the fresh one "start a new
    // order" makes, so the match is never tied to one.
    expect(sent).not.toHaveProperty("cartId");
  });

  it("never draws the legacy reasons' working notes", async () => {
    await renderInSafeArea(<MatchScreen />);
    await screen.findByText("TOP PICK");

    expect(screen.queryByText(/88% listing completeness/)).toBeNull();
  });
});

describe("MatchScreen — other listings, and no shop identity", () => {
  it("lists one row per other listing with the same facts and no badge", async () => {
    await renderInSafeArea(<MatchScreen />);
    await screen.findByText("TOP PICK");

    expect(screen.getByText("OTHER LISTINGS FOR THIS DAY")).toBeTruthy();
    expect(screen.getByText("UV Printing")).toBeTruthy();
    expect(screen.getByText("Tarpaulin Banner")).toBeTruthy();
    expect(screen.getByText("₱11.00 per sq ft")).toBeTruthy();
    expect(screen.getByText("₱13.20 per sq ft")).toBeTruthy();
    expect(screen.getAllByText("Ready in 1 hour")).toHaveLength(2);
    expect(screen.getByText("Long Distance")).toBeTruthy();
    expect(screen.getByText("4.6 (8)")).toBeTruthy();
    // The place each would take, said the way a queue is said.
    expect(screen.getByLabelText(/UV Printing, ₱11\.00 per sq ft, Ready in 1 hour, 1st in line/)).toBeTruthy();
    expect(screen.getByLabelText(/Tarpaulin Banner, ₱13\.20 per sq ft, .*2nd in line/)).toBeTruthy();
    // One badge on the whole screen: the Top Pick's.
    expect(screen.getAllByText(/^MATCHED FOR/)).toHaveLength(1);
  });

  it("never shows a shop's name, address, contact or id — not the pick's, not anyone's", async () => {
    await renderInSafeArea(<MatchScreen />);
    await screen.findByText("TOP PICK");

    for (const identity of SHOP_IDENTITY) {
      const pattern = new RegExp(identity.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      expect(screen.queryByText(pattern)).toBeNull();
      expect(screen.queryByLabelText(pattern)).toBeNull();
    }
  });

  it("puts the pick's own other listings after the other shops'", async () => {
    api.matchShop.mockResolvedValue(
      topPickMatch({
        listings: [topListing(), topListing("sci_lovis_tarp_13oz", { name: "Tarpaulin, 13 oz" })],
        otherListings: [otherListing("sci_rapid_uv")],
      }),
    );
    await renderInSafeArea(<MatchScreen />);
    await screen.findByText("TOP PICK");

    const rows = screen.getAllByLabelText(/^(UV Printing|Tarpaulin, 13 oz),/);
    expect(rows.map((row) => row.props.accessibilityLabel.split(",")[0])).toEqual([
      "UV Printing",
      "Tarpaulin",
    ]);
  });

  it("draws the designed wait while GRIDGO is finding a printer", async () => {
    api.matchShop.mockReturnValue(new Promise(() => {}));
    await renderInSafeArea(<MatchScreen />);

    expect(
      await screen.findByLabelText("Finding a printer for tarpaulins & outdoor banners"),
    ).toBeTruthy();
    expect(screen.getByText("GRIDGO is finding a printer.")).toBeTruthy();
    // The ranking row stays put above it.
    expect(screen.getByLabelText("1: Quality")).toBeTruthy();
  });
});

describe("MatchScreen — choosing", () => {
  it("Proceed opens the Top Pick, carrying its pick token", async () => {
    await renderInSafeArea(<MatchScreen />);
    await screen.findByText("TOP PICK");

    fireEvent.press(screen.getByRole("button", { name: "Proceed" }));

    // No shop name travels with the listing.
    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/request/listing",
      params: { itemId: "sci_lovis_tarp" },
    });
    expect(matchSelectionFor("sci_lovis_tarp")).toEqual({
      matchRequestId: "req_match_1",
      selectToken: "tok_sci_lovis_tarp",
      expiresAt: "2099-01-01T00:00:00.000Z",
    });
  });

  it("tapping another listing selects it by its own token", async () => {
    await renderInSafeArea(<MatchScreen />);
    await screen.findByText("TOP PICK");

    fireEvent.press(screen.getByLabelText(/^Tarpaulin Banner, /));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/request/listing",
      params: { itemId: "sci_zone_tarp" },
    });
    expect(matchSelectionFor("sci_zone_tarp")).toEqual({
      matchRequestId: "req_match_1",
      selectToken: "tok_sci_zone_tarp",
      expiresAt: "2099-01-01T00:00:00.000Z",
    });
    expect(matchSelectionFor("sci_lovis_tarp")).toBeNull();
  });

  it("Cancel leaves the flow for Home — nothing is in the basket yet", async () => {
    await renderInSafeArea(<MatchScreen />);
    await screen.findByText("TOP PICK");

    fireEvent.press(screen.getByRole("button", { name: "Cancel" }));
    expect(mockDismissTo).toHaveBeenCalledWith("/(tabs)/home");
  });
});

describe("MatchScreen — when GRIDGO cannot answer", () => {
  it("says plainly when GRIDGO cannot print this yet", async () => {
    api.matchShop.mockRejectedValue(
      new api.ApiError(404, { error: "match_not_found", message: "No approved open shop." }),
    );
    await renderInSafeArea(<MatchScreen />);

    expect(
      await screen.findByText("GRIDGO cannot print tarpaulins & outdoor banners today"),
    ).toBeTruthy();
    expect(screen.getByText(/Operations can still quote it with you/)).toBeTruthy();
  });

  it("shows a designed failure when GRIDGO cannot be reached", async () => {
    api.matchShop.mockRejectedValue(new Error("Network request failed"));
    await renderInSafeArea(<MatchScreen />);

    expect(await screen.findByText("GRIDGO could not answer")).toBeTruthy();
    expect(screen.getByText("Try again")).toBeTruthy();
  });

  it("says when nobody can make the date, and Change my date goes back to the date", async () => {
    api.matchShop.mockRejectedValue(
      new api.ApiError(409, {
        error: "deadline_not_met",
        earliestAvailable: "2026-10-16T03:55:00.000Z",
      }),
    );
    await renderInSafeArea(<MatchScreen />);

    expect(
      await screen.findByText("Nobody can finish tarpaulins & outdoor banners by then"),
    ).toBeTruthy();
    expect(screen.getByText(/The soonest anyone can do it/)).toBeTruthy();

    fireEvent.press(screen.getByText("Change my date"));
    expect(mockDismissTo).toHaveBeenCalledWith({
      pathname: "/request/when",
      params: { subcategory: "tarpaulins_outdoor_banners", category: "marketing_collateral" },
    });
  });
});
