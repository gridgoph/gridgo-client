import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import CategoryScreen from "@/app/request/[category]";
import ChooseCategoryScreen from "@/app/request/category";
import { PRODUCT_CATEGORY_SEED } from "@/data/productCategories";
import { useRequestDraft } from "@/store/requestDraft";

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
  return {
    ...actual,
    getProductCategories: jest.fn(),
    listCatalog: jest.fn(),
  };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require("@/lib/api");

const CATALOG = [
  { id: "prod_flyer", name: "Brochures / Flyers", family: "flyer", basePriceMinor: 2500, unit: "pack100" },
  { id: "prod_apparel", name: "Simple Apparel Print", family: "apparel", basePriceMinor: 28000, unit: "piece" },
];

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
  api.listCatalog.mockResolvedValue(CATALOG);
  useRequestDraft.getState().reset();
});

describe("ChooseCategoryScreen", () => {
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
  it("separates what the app prices from what Operations quotes", async () => {
    await renderInSafeArea(<CategoryScreen />);

    expect(await screen.findByText("ORDER IN THE APP")).toBeTruthy();
    expect(screen.getByText("QUOTED BY OPERATIONS")).toBeTruthy();
    expect(screen.getByText(/not priced in the app yet/)).toBeTruthy();
  });

  it("drops the group labels when there is only one group to label", async () => {
    // Nothing in this category is priced, so "QUOTED BY OPERATIONS" would head
    // the only list on the screen and tell the client nothing the sentence
    // under it does not already say in words.
    mockOpenCategory = "specialized_prototyping";
    await renderInSafeArea(<CategoryScreen />);

    expect(await screen.findByText(/not priced in the app yet/)).toBeTruthy();
    expect(screen.queryByText("QUOTED BY OPERATIONS")).toBeNull();
    expect(screen.queryByText("ORDER IN THE APP")).toBeNull();
  });

  it("makes only the priced subcategory a control", async () => {
    await renderInSafeArea(<CategoryScreen />);
    await screen.findByText("ORDER IN THE APP");

    // Custom apparel resolves to a catalog product, so it is tappable.
    expect(screen.getByLabelText("Custom apparel")).toBeTruthy();
    // Drinkware does not, so it is shown as information and never as a button
    // that leads nowhere.
    expect(screen.getByText("Drinkware")).toBeTruthy();
    expect(screen.queryByLabelText("Drinkware")).toBeNull();
  });

  it("seeds the draft from the catalog product behind the subcategory", async () => {
    await renderInSafeArea(<CategoryScreen />);
    await screen.findByText("ORDER IN THE APP");

    fireEvent.press(screen.getByLabelText("Custom apparel"));

    await waitFor(() =>
      expect(useRequestDraft.getState().productId).toBe("prod_apparel"),
    );
    expect(useRequestDraft.getState().family).toBe("apparel");
    expect(useRequestDraft.getState().productName).toBe("Simple Apparel Print");
  });

  it("shows a designed failure, not a blank screen, when the tree cannot load", async () => {
    api.getProductCategories.mockRejectedValue(new Error("Failed to fetch"));
    await renderInSafeArea(<CategoryScreen />);

    expect(await screen.findByText("Could not load")).toBeTruthy();
    expect(screen.getByText("Try again")).toBeTruthy();
  });
});
