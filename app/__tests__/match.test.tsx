import { fireEvent, render, screen } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import MatchScreen from "@/app/request/match";
import { PRODUCT_CATEGORY_SEED } from "@/data/productCategories";
import type { MatchReason, MatchResult } from "@/lib/api";
import { clearMatchPrefetch } from "@/lib/matchPrefetch";
import { useCart } from "@/store/cart";
import { usePriorities } from "@/store/priorities";

const mockPush = jest.fn();
const mockBack = jest.fn();

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, back: mockBack, replace: jest.fn() }),
  useLocalSearchParams: () => ({ subcategory: "flyers", category: "marketing_collateral" }),
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

const RANKED: MatchReason[] = [
  { code: "ranked_speed", factor: "speed", rank: 1, weight: 0.5, detail: "0 jobs ahead; about 48 hours" },
  { code: "ranked_quality", factor: "quality", rank: 2, weight: 0.3, detail: "88% listing completeness" },
  { code: "ranked_distance", factor: "distance", rank: 3, weight: 0.2, detail: "1240 metres from the delivery pin" },
];

function flyers(supplierId: string) {
  return {
    id: `${supplierId}_flyers`,
    supplierId,
    supplierServiceId: `svc_${supplierId}`,
    categoryCode: "marketing_collateral",
    subcategoryCode: "flyers",
    name: "Flyers",
    description: null,
    basePriceMinor: 2500,
    fromPriceMinor: 2500,
    effectivePriceMinor: null,
    pricingUnit: "per_package" as const,
    packageQty: 100,
    measurementKind: "none" as const,
    measureUnit: null,
    minimumWidthMilli: null,
    minimumHeightMilli: null,
    minimumLengthMilli: null,
    minimumOrderQuantity: null,
    priceTiers: [],
    speedTiers: [],
    pricingBasis: "per_unit",
    turnaroundMode: "override" as const,
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

function match(
  supplierId: string,
  shopName: string,
  overrides: Partial<MatchResult> = {},
): MatchResult {
  return {
    shop: {
      supplierId,
      shopName,
      shop: { lat: 7.0731, lng: 125.6128, label: `${shopName} · Bajada, Davao City` },
      media: [],
      categories: ["marketing_collateral"],
      services: [],
    },
    queue: { jobsAhead: 0, estimatedHours: 48 },
    reasons: RANKED,
    listings: [flyers(supplierId)],
    alternativesCount: 0,
    score: {
      total: 82,
      weights: { quality: 0.3, speed: 0.4, cost: 0.2, distance: 0.1 },
      factors: { quality: 88, speed: 100, cost: 100, distance: 0 },
    },
    ...overrides,
  };
}

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
  api.productCategoriesNow.mockReturnValue(PRODUCT_CATEGORY_SEED);
  api.getProductCategories.mockResolvedValue(PRODUCT_CATEGORY_SEED);
  api.matchShop.mockResolvedValue(match("user_lovis", "Lovis Printshop"));
  api.matchNextShop.mockReset();
  clearMatchPrefetch();
  useCart.getState().reset();
  usePriorities.setState({ ranking: ["speed", "quality", "cost", "distance"], loaded: true });
});

describe("MatchScreen", () => {
  it("shows GRIDGO's pick and the reason it was made", async () => {
    api.matchShop.mockResolvedValue(
      match("user_rapid", "Rapid Print", {
        alternativesCount: 1,
        queue: { jobsAhead: 0, estimatedHours: 24 },
      }),
    );
    await renderInSafeArea(<MatchScreen />);

    expect(await screen.findByText("GRIDGO’s pick for flyers")).toBeTruthy();
    expect(screen.getByText("FASTEST")).toBeTruthy();
    expect(
      screen.getByText("Fastest on flyers — about 1 day including what is in front of you."),
    ).toBeTruthy();
  });

  it("never shows the printer's name or address — GRIDGO is the counter", async () => {
    await renderInSafeArea(<MatchScreen />);
    await screen.findByText("GRIDGO’s pick for flyers");

    // The match still picked a real shop; the client simply never reads it.
    expect(screen.queryByText(/Lovis/i)).toBeNull();
    expect(screen.queryByLabelText(/Lovis/i)).toBeNull();
    expect(screen.queryByText(/Bajada/i)).toBeNull();
    expect(screen.queryByLabelText(/Bajada/i)).toBeNull();
  });

  it("asks GRIDGO to match on the thing being printed", async () => {
    await renderInSafeArea(<MatchScreen />);
    await screen.findByText("GRIDGO’s pick for flyers");

    expect(api.matchShop).toHaveBeenCalledWith(
      expect.objectContaining({ subcategoryCode: "flyers" }),
    );
  });

  it("reads the client's own ranking back, as a way into changing it", async () => {
    await renderInSafeArea(<MatchScreen />);
    await screen.findByText("GRIDGO’s pick for flyers");

    // One chip per priority, in the order the client put them. The sentence
    // this replaced said the same thing in a grey line nobody read.
    expect(screen.getByText("MATCHED ON")).toBeTruthy();
    expect(screen.getByLabelText("1: Speed")).toBeTruthy();
    expect(screen.getByLabelText("2: Quality")).toBeTruthy();
    expect(screen.getByLabelText("3: Cost")).toBeTruthy();
    expect(screen.getByLabelText("4: Distance")).toBeTruthy();

    fireEvent.press(screen.getByLabelText("Change what GRIDGO matches on"));
    // Back to this match afterwards, not Home: they came here to read one.
    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/priorities",
      params: { returnTo: "match" },
    });
  });

  it("shows the client's real place in the queue", async () => {
    api.matchShop.mockResolvedValue(
      match("user_lovis", "Lovis Printshop", {
        queue: { jobsAhead: 2, estimatedHours: 144 },
      }),
    );
    await renderInSafeArea(<MatchScreen />);
    await screen.findByText("GRIDGO’s pick for flyers");

    expect(screen.getByText("3rd in line")).toBeTruthy();
    expect(screen.getByText("2 jobs ahead of yours")).toBeTruthy();
    expect(screen.getByText("6 days")).toBeTruthy();
  });

  it("says nothing about the API's own working notes", async () => {
    await renderInSafeArea(<MatchScreen />);
    await screen.findByText("GRIDGO’s pick for flyers");

    expect(screen.queryByText(/88% listing completeness/)).toBeNull();
    expect(screen.queryByText(/metres from the delivery pin/)).toBeNull();
  });

  it("does not offer another shop — GRIDGO answers once", async () => {
    api.matchShop.mockResolvedValue(
      match("user_rapid", "Rapid Print", { alternativesCount: 5 }),
    );
    await renderInSafeArea(<MatchScreen />);
    await screen.findByText("GRIDGO’s pick for flyers");

    expect(screen.getByText("Your flyers")).toBeTruthy();
    expect(screen.queryByText(/Another shop for/)).toBeNull();
    expect(screen.queryByText(/See next shop/)).toBeNull();
    expect(screen.queryByText(/Finding another shop/)).toBeNull();
    expect(screen.queryByLabelText("See the next shop")).toBeNull();
    expect(api.matchNextShop).not.toHaveBeenCalled();
  });

  it("draws the designed wait, naming the thing being printed", async () => {
    api.matchShop.mockReturnValue(new Promise(() => {}));
    await renderInSafeArea(<MatchScreen />);

    // Same heading as the loaded screen, so nothing above the fold moves when
    // the match lands.
    expect(await screen.findByText("Your flyers")).toBeTruthy();
    expect(screen.getByLabelText("Finding a printer for flyers")).toBeTruthy();
    expect(screen.getByText("GRIDGO is finding a printer.")).toBeTruthy();
    expect(screen.queryByText(/Finding your shop/)).toBeNull();
  });

  it("lists what GRIDGO can print and opens one", async () => {
    await renderInSafeArea(<MatchScreen />);
    await screen.findByText("GRIDGO’s pick for flyers");

    expect(screen.getByText("1 FLYERS LISTING")).toBeTruthy();
    fireEvent.press(screen.getByLabelText("Flyers, from ₱25.00 per pack of 100"));

    // No shop name travels with the listing.
    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/request/listing",
      params: { itemId: "user_lovis_flyers" },
    });
  });

  it("says plainly when GRIDGO cannot print this yet", async () => {
    api.matchShop.mockRejectedValue(
      new api.ApiError(404, { error: "match_not_found", message: "No approved open shop." }),
    );
    await renderInSafeArea(<MatchScreen />);

    expect(await screen.findByText("GRIDGO cannot print flyers today")).toBeTruthy();
    expect(screen.getByText(/Operations can still quote it with you/)).toBeTruthy();
  });

  it("shows a designed failure when GRIDGO cannot be reached", async () => {
    api.matchShop.mockRejectedValue(new Error("Network request failed"));
    await renderInSafeArea(<MatchScreen />);

    expect(await screen.findByText("GRIDGO could not answer")).toBeTruthy();
    expect(screen.getByText("Try again")).toBeTruthy();
  });
});
