import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
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
let mockOpenCategory = "event_merchandise";

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
    categoryCode: "event_merchandise",
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
  categories: ["event_merchandise"],
  itemCount: 1,
};

const BOARD = {
  ...SHOP,
  services: [
    {
      id: "svc_merch",
      version: 1,
      categoryCode: "event_merchandise",
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
  mockOpenCategory = "event_merchandise";
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
  usePriorities.setState({ ranking: ["quality", "speed", "distance"], loaded: true });
});

describe("ChooseCategoryScreen", () => {
  it("shows the four categories without waiting on the network", async () => {
    api.getProductCategories.mockReturnValue(new Promise(() => {}));
    await renderInSafeArea(<ChooseCategoryScreen />);

    expect(screen.getByText("Marketing & promotional collateral")).toBeTruthy();
    expect(screen.getByText("Corporate & event merchandise")).toBeTruthy();
    expect(screen.queryByText("Loading what GRIDGO prints…")).toBeNull();
  });

  it("leads with the audience line, because that is how a client recognises themselves", async () => {
    await renderInSafeArea(<ChooseCategoryScreen />);

    expect(
      await screen.findByText(/Best for student orgs, HR teams, event organizers/),
    ).toBeTruthy();
    expect(
      screen.getByText(/Best for businesses, startups, and events/),
    ).toBeTruthy();
  });

  it("finds a subcategory by an example, not only by its name", async () => {
    await renderInSafeArea(<ChooseCategoryScreen />);
    await screen.findByText("Marketing & promotional collateral");

    fireEvent.changeText(
      screen.getByLabelText("Search what GRIDGO prints"),
      "tote bag",
    );

    await waitFor(() => expect(screen.getByText("Custom apparel")).toBeTruthy());
    expect(screen.getByText("1 MATCH")).toBeTruthy();
  });

  it("invites the client to browse instead of dead-ending on no match", async () => {
    await renderInSafeArea(<ChooseCategoryScreen />);
    await screen.findByText("Marketing & promotional collateral");

    fireEvent.changeText(
      screen.getByLabelText("Search what GRIDGO prints"),
      "helicopter",
    );

    await waitFor(() => expect(screen.getByText(/Nothing matches/)).toBeTruthy());
    expect(screen.getByText("Browse the categories")).toBeTruthy();
  });

  it("says nothing about internal codes anywhere on the screen", async () => {
    await renderInSafeArea(<ChooseCategoryScreen />);
    await screen.findByText("Marketing & promotional collateral");

    for (const category of PRODUCT_CATEGORY_SEED) {
      expect(screen.queryByText(category.code)).toBeNull();
      for (const sub of category.subcategories) {
        expect(screen.queryByText(sub.code)).toBeNull();
      }
    }
  });
});

describe("CategoryScreen", () => {
  it("separates what GRIDGO is printing today from what Operations quotes", async () => {
    await renderInSafeArea(<CategoryScreen />);

    expect(await screen.findByText("GRIDGO PRINTS THESE NOW")).toBeTruthy();
    expect(screen.getByText("QUOTED BY OPERATIONS")).toBeTruthy();
    expect(screen.getByText(/None of them is on a press today/)).toBeTruthy();
  });

  it("drops the group labels when there is only one group to label", async () => {
    // No shop lists anything in this category, so "QUOTED BY OPERATIONS" would
    // head the only list on the screen and tell the client nothing the sentence
    // under it does not already say in words.
    mockOpenCategory = "specialized_prototyping";
    api.listCatalogShops.mockResolvedValue([]);
    await renderInSafeArea(<CategoryScreen />);

    expect(await screen.findByText(/None of them is on a press today/)).toBeTruthy();
    expect(screen.queryByText("QUOTED BY OPERATIONS")).toBeNull();
    expect(screen.queryByText("GRIDGO PRINTS THESE NOW")).toBeNull();
  });

  it("makes only the subcategory GRIDGO can really print a control", async () => {
    await renderInSafeArea(<CategoryScreen />);
    await screen.findByText("GRIDGO PRINTS THESE NOW");

    // A shop has custom apparel on its board, so it is tappable.
    expect(screen.getByLabelText("Custom apparel")).toBeTruthy();
    // Nobody lists drinkware, so it is shown as information and never as a
    // button that leads to a screen saying there is no shop for it.
    expect(screen.getByText("Drinkware")).toBeTruthy();
    expect(screen.queryByLabelText("Drinkware")).toBeNull();
  });

  it("says what it starts at, and never how many shops print it", async () => {
    await renderInSafeArea(<CategoryScreen />);
    await screen.findByText("GRIDGO PRINTS THESE NOW");

    expect(screen.getByText("From ₱280.00")).toBeTruthy();
    // A shop count is a number nobody can act on, and it makes GRIDGO read as
    // a directory rather than the counter the client is buying from.
    expect(screen.queryByText(/\d+ shops?/)).toBeNull();
    expect(screen.queryByText(/Lovis/i)).toBeNull();
  });

  it("takes the client to GRIDGO's match, not to a platform product", async () => {
    await renderInSafeArea(<CategoryScreen />);
    await screen.findByText("GRIDGO PRINTS THESE NOW");

    fireEvent.press(screen.getByLabelText("Custom apparel"));

    await waitFor(() => expect(mockPush).toHaveBeenCalled());
    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/request/match",
      params: { subcategory: "custom_apparel", category: "event_merchandise" },
    });
  });

  it("asks where the job is going first when the client put distance first", async () => {
    usePriorities.setState({ ranking: ["distance", "speed", "quality"], loaded: true });
    await renderInSafeArea(<CategoryScreen />);
    await screen.findByText("GRIDGO PRINTS THESE NOW");

    fireEvent.press(screen.getByLabelText("Custom apparel"));

    await waitFor(() => expect(mockPush).toHaveBeenCalled());
    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/request/where",
      params: { subcategory: "custom_apparel", category: "event_merchandise" },
    });
  });

  it("still shows the category when taxonomy cannot be reached", async () => {
    api.getProductCategories.mockRejectedValue(new Error("Failed to fetch"));
    await renderInSafeArea(<CategoryScreen />);

    expect(await screen.findByText("Corporate & event merchandise")).toBeTruthy();
    expect(screen.queryByText("Could not load")).toBeNull();
  });
});
