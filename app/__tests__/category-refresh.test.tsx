import { act, fireEvent, render, screen } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import CategoryScreen from "@/app/request/[category]";
import { PRODUCT_CATEGORY_SEED } from "@/data/productCategories";
import { clearProductCategoryCache } from "@/lib/api";
import { clearBoardCache } from "@/lib/shopBoards";
import { useCart } from "@/store/cart";
import { usePlatformSettings } from "@/store/platformSettings";
import { usePriorities } from "@/store/priorities";

/**
 * The category screen reads its boards twice over: on focus, and again when
 * its photo links expire or the app resumes on an old read. Both must say a
 * short answer with the Retry that finishes it — a re-read that lost the one
 * board listing Flyers used to drop Flyers and ask the client to "try again"
 * with nothing to press.
 */

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), dismissTo: jest.fn() }),
  useLocalSearchParams: () => ({ category: "marketing_collateral" }),
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
    listCatalogShops: jest.fn(),
    getCatalogShop: jest.fn(),
  };
});

/** The screen's photo-link re-read, as the refresh hook would call it. */
let mockReread: ((options: { force: boolean }) => Promise<unknown>) | null = null;
jest.mock("@/hooks/usePhotoLinkRefresh", () => ({
  usePhotoLinkRefresh: (
    _listings: unknown,
    reread: (options: { force: boolean }) => Promise<unknown>,
  ) => {
    mockReread = reread;
    return jest.fn();
  },
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require("@/lib/api");

const SHOPS = [0, 1].map((index) => ({
  supplierId: `shop_${index}`,
  shopName: `Test studio ${index}`,
  shop: null,
  media: [],
  categories: ["marketing_collateral"],
}));

function board(index: number) {
  const subcategoryCode = index === 1 ? "flyers" : "tarpaulins_outdoor_banners";
  return {
    ...SHOPS[index],
    services: [
      {
        id: `svc_${index}`,
        version: 1,
        categoryCode: "marketing_collateral",
        pricingBasis: "per_unit",
        turnaroundHours: 48,
        acceptedFormats: ["png"],
        items: [
          {
            id: `sci_${index}`,
            supplierId: `shop_${index}`,
            supplierServiceId: `svc_${index}`,
            categoryCode: "marketing_collateral",
            subcategoryCode,
            name: index === 1 ? "Flyers" : "Tarpaulin",
            description: null,
            basePriceMinor: 500,
            fromPriceMinor: 500,
            effectivePriceMinor: null,
            pricingUnit: "per_unit",
            packageQty: null,
            pricingBasis: "per_unit",
            turnaroundMode: "override",
            turnaroundHours: 48,
            rush: null,
            acceptedFormats: [],
            photos: [],
            prepSteps: [],
            optionGroups: [],
            version: 1,
            serviceVersion: 1,
          },
        ],
      },
    ],
  };
}

/** Every board reads, or the one listing Flyers fails. */
function boards({ flyersFail }: { flyersFail: boolean }) {
  api.getCatalogShop.mockImplementation(async (supplierId: string) => {
    const index = Number(supplierId.split("_")[1]);
    if (flyersFail && index === 1) throw new Error("Network request failed");
    return board(index);
  });
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
  mockReread = null;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("@react-native-async-storage/async-storage").clear();
  api.getProductCategories.mockResolvedValue(PRODUCT_CATEGORY_SEED);
  api.productCategoriesNow.mockReturnValue(PRODUCT_CATEGORY_SEED);
  clearProductCategoryCache();
  api.listCatalogShops.mockResolvedValue({ shops: SHOPS, complete: true });
  clearBoardCache();
  useCart.getState().reset();
  usePlatformSettings.getState().reset();
  usePlatformSettings.getState().adopt({
    issueWindowHours: 24,
    serviceFeeRateBps: 1000,
    deliveryFeeBands: [{ maxDistanceMeters: null, feeMinor: 2500 }],
  });
  usePriorities.setState({ ranking: ["quality", "speed", "cost", "distance"], loaded: true });
});

describe("CategoryScreen re-reading its boards", () => {
  it("clears an earlier short read once a re-read comes back whole", async () => {
    boards({ flyersFail: true });
    await renderInSafeArea(<CategoryScreen />);
    expect(await screen.findByText("Prices not loaded")).toBeTruthy();

    boards({ flyersFail: false });
    await act(async () => {
      await mockReread?.({ force: true });
    });

    expect(await screen.findByLabelText(/^Flyers/)).toBeTruthy();
    expect(screen.queryByText("Prices not loaded")).toBeNull();
  });

  it("says a re-read that failed outright, with Retry, and stops calling the list whole", async () => {
    boards({ flyersFail: false });
    await renderInSafeArea(<CategoryScreen />);
    expect(await screen.findByLabelText(/^Flyers/)).toBeTruthy();

    api.listCatalogShops.mockRejectedValueOnce(new Error("Network request failed"));
    await act(async () => {
      await mockReread?.({ force: true }).catch(() => undefined);
    });

    expect(await screen.findByText("Prices not loaded")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
    expect(screen.queryByText(/None of them is on a press today/)).toBeNull();
  });

  // Presses, so it goes last in this file (see AGENTS.md, Running and testing).
  it("offers Retry after a partial re-read, and Retry brings the missing product back", async () => {
    boards({ flyersFail: false });
    await renderInSafeArea(<CategoryScreen />);
    expect(await screen.findByLabelText(/^Flyers/)).toBeTruthy();

    // The photo links expire; the re-read loses the board listing Flyers.
    boards({ flyersFail: true });
    await act(async () => {
      await mockReread?.({ force: true });
    });

    expect(await screen.findByText("Prices not loaded")).toBeTruthy();
    expect(screen.queryByText(/None of them is on a press today/)).toBeNull();

    boards({ flyersFail: false });
    fireEvent.press(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByLabelText(/^Flyers/)).toBeTruthy();
    expect(screen.queryByText("Prices not loaded")).toBeNull();
  });
});
