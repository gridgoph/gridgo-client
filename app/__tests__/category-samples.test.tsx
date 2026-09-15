import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import CategoryScreen from "@/app/request/[category]";
import ChooseCategoryScreen from "@/app/request/category";
import { PRODUCT_CATEGORY_SEED } from "@/data/productCategories";
import { clearProductCategoryCache } from "@/lib/api";
import { clearBoardCache } from "@/lib/shopBoards";
import { useCart } from "@/store/cart";
import { usePriorities } from "@/store/priorities";

const mockPush = jest.fn();

/** Which category `[category].tsx` is rendering. Reset in beforeEach. */
let mockOpenCategory = "corporate_event_merch";

jest.mock("expo-router", () => ({
  useRouter: () => ({
    push: mockPush,
    replace: jest.fn(),
    back: jest.fn(),
    dismissTo: jest.fn(),
  }),
  useLocalSearchParams: () => ({ category: mockOpenCategory }),
  useFocusEffect: (effect: () => void) => {
    // Required inside the factory: jest.mock is hoisted above imports.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useEffect } = require("react");
    useEffect(effect, [effect]);
  },
}));

jest.mock("@/lib/api", () => {
  const actual = jest.requireActual("@/lib/api");
  const { PRODUCT_CATEGORY_SEED: seed } = jest.requireActual("@/data/productCategories");
  return {
    ...actual,
    getProductCategories: jest.fn(),
    productCategoriesNow: jest.fn(() => seed),
    listCatalog: jest.fn(),
    listCatalogShops: jest.fn(),
    getCatalogShop: jest.fn(),
  };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require("@/lib/api");

const CATALOG = [
  { id: "prod_flyer", name: "Brochures / Flyers", family: "flyer", basePriceMinor: 2500, unit: "pack100" },
  { id: "prod_apparel", name: "Simple Apparel Print", family: "apparel", basePriceMinor: 28000, unit: "piece" },
];

/**
 * One approved shop with one complete listing.
 *
 * What a client may order is what a shop has on its board, so the split on this
 * screen is built from boards rather than from the platform catalog. Custom
 * apparel is listed here; nothing else in the category is, which is exactly the
 * shape the screen has to tell apart.
 */
function listing(subcategoryCode: string, fromPriceMinor: number) {
  return {
    id: `sci_${subcategoryCode}`,
    supplierId: "user_shop",
    supplierServiceId: "svc_merch",
    categoryCode: "corporate_event_merch",
    subcategoryCode,
    name: "Custom apparel",
    description: null,
    basePriceMinor: fromPriceMinor,
    fromPriceMinor,
    effectivePriceMinor: null,
    pricingUnit: "per_unit" as const,
    packageQty: null,
    pricingBasis: "per_unit",
    turnaroundMode: "override" as const,
    turnaroundHours: 72,
    rush: null,
    acceptedFormats: [],
    photos: [],
    prepSteps: [],
    optionGroups: [],
    version: 1,
    serviceVersion: 1,
  };
}

const SHOP = {
  supplierId: "user_shop",
  shopName: "Lovis Printshop",
  shop: { lat: 7.0731, lng: 125.6128, label: "Bajada, Davao City" },
  media: [],
  categories: ["corporate_event_merch"],
  itemCount: 1,
};

const BOARD = {
  ...SHOP,
  services: [
    {
      id: "svc_merch",
      version: 1,
      categoryCode: "corporate_event_merch",
      pricingBasis: "per_unit",
      turnaroundHours: 72,
      acceptedFormats: ["png"],
      items: [listing("custom_apparel", 28000)],
    },
  ],
};

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
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("@react-native-async-storage/async-storage").clear();
  mockOpenCategory = "corporate_event_merch";
  api.getProductCategories.mockResolvedValue(PRODUCT_CATEGORY_SEED);
  api.productCategoriesNow.mockReturnValue(PRODUCT_CATEGORY_SEED);
  clearProductCategoryCache();
  api.listCatalog.mockResolvedValue(CATALOG);
  api.listCatalogShops.mockResolvedValue([SHOP]);
  api.getCatalogShop.mockResolvedValue(BOARD);
  // The boards are cached for a minute across screens, so each test starts
  // from a cold read rather than the previous test's shop.
  clearBoardCache();
  useCart.getState().reset();
  usePriorities.setState({ ranking: ["quality", "speed", "cost", "distance"], loaded: true });
});

/**
 * The sample wall, in a file of its own.
 *
 * Split out because of a real limit in this combination of testing-library and
 * React 19, documented in AGENTS.md: after two presses a file's later renders
 * come back empty, with no error. This test presses and then types three
 * times, so it cannot share a file with the two that press.
 */
describe("CategoryScreen samples", () => {
  it("hunts the samples on this category and can switch to a wall", async () => {
    await renderInSafeArea(<CategoryScreen />);
    await screen.findByText("GRIDGO PRINTS THESE NOW");

    await fireEvent.press(screen.getByLabelText("Show as a wall"));
    expect(screen.getByLabelText(/Custom apparel/)).toBeTruthy();
    expect(screen.getByLabelText("Show as a wall")).toBeTruthy();

    await fireEvent.changeText(screen.getByLabelText(/Find a sample/), "hoodie");
    expect(screen.getByLabelText(/Custom apparel/)).toBeTruthy();

    await fireEvent.changeText(screen.getByLabelText(/Find a sample/), "tarpaulin");
    expect(await screen.findByText(/Nothing in this category matches/)).toBeTruthy();
    expect(screen.queryByLabelText(/Custom apparel/)).toBeNull();
  });
});

let mockRefresh: () => Promise<void>;
jest.mock("@/hooks/useLiveRefresh", () => ({
  useLiveRefresh: (_resources: unknown, refresh: () => Promise<void>) => { mockRefresh = refresh; },
}));

it("keeps current category prices when an old board request finishes late", async () => {
  let finish!: (board: typeof BOARD) => void;
  let started!: () => void;
  const firstRead = new Promise<void>((resolve) => { started = resolve; });
  api.getCatalogShop.mockImplementationOnce(() => {
    started();
    return new Promise((resolve) => { finish = resolve; });
  });
  const newer = {
    ...BOARD,
    services: BOARD.services.map((service) => ({
      ...service,
      items: service.items.map((item) => ({ ...item, basePriceMinor: 99900, fromPriceMinor: 99900 })),
    })),
  };
  api.getCatalogShop.mockResolvedValue(newer);
  await renderInSafeArea(<CategoryScreen />);
  await firstRead;
  clearBoardCache();
  await act(async () => { await mockRefresh(); });
  expect(screen.getAllByText(/999\.00/).length).toBeGreaterThan(0);
  await act(async () => { finish(BOARD); });
  expect(screen.getAllByText(/999\.00/).length).toBeGreaterThan(0);
});

it("shows a newly published subcategory when its tree and board refresh", async () => {
  await renderInSafeArea(<CategoryScreen />);
  await screen.findByText("GRIDGO PRINTS THESE NOW");
  const name = "New printed notebooks";
  expect(screen.queryByLabelText(new RegExp(name))).toBeNull();
  api.getProductCategories.mockResolvedValue(PRODUCT_CATEGORY_SEED.map((category) =>
    category.code === mockOpenCategory ? {
      ...category,
      subcategories: [...category.subcategories, { code: "notebooks", name, examples: "Notebooks", productFamilyIds: [] }],
    } : category,
  ));
  api.getCatalogShop.mockResolvedValue({
    ...BOARD,
    services: BOARD.services.map((service) => ({
      ...service, items: [...service.items, { ...listing("notebooks", 12000), name }],
    })),
  });
  clearBoardCache();
  await act(async () => { await mockRefresh(); });
  expect(screen.getByLabelText(new RegExp(name))).toBeTruthy();
});
