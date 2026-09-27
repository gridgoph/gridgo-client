import { render, screen, waitFor } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import HomeScreen from "@/app/(tabs)/home";
import type { CatalogItem, ShopBoard, ShopSummary } from "@/lib/api";
import { clearBoardCache } from "@/lib/shopBoards";
import { useCart } from "@/store/cart";
import { usePlatformSettings } from "@/store/platformSettings";
import { useRequestDraft } from "@/store/requestDraft";
import { useSession } from "@/store/session";

jest.mock("expo-router", () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  useFocusEffect: (effect: () => void) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useEffect } = require("react");
    useEffect(effect, [effect]);
  },
}));

jest.mock("@/lib/api", () => {
  const actual = jest.requireActual("@/lib/api");
  return {
    ...actual,
    listOrders: jest.fn(async () => []),
    getProductCategories: jest.fn(async () => []),
    getCart: jest.fn(async () => null),
    listCatalogShops: jest.fn(async () => []),
    getCatalogShop: jest.fn(async () => null),
  };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require("@/lib/api");

const START = Date.parse("2026-09-27T08:00:00.000Z");
const minutesFrom = (base: number, minutes: number) =>
  new Date(base + minutes * 60_000).toISOString();

function flyers(link: string, expiresAt: string): CatalogItem {
  return {
    id: "sci_flyers",
    supplierId: "user_shop",
    supplierServiceId: "svc",
    categoryCode: "marketing_collateral",
    subcategoryCode: "flyers",
    name: "flyers",
    description: null,
    basePriceMinor: 45_000,
    fromPriceMinor: 45_000,
    effectivePriceMinor: null,
    pricingUnit: "per_unit",
    packageQty: null,
    measurementKind: "none",
    measureUnit: null,
    minimumWidthMilli: null,
    minimumHeightMilli: null,
    minimumLengthMilli: null,
    minimumOrderQuantity: null,
    priceTiers: [],
    speedTiers: [],
    pricingBasis: "per_unit",
    turnaroundMode: "override",
    turnaroundHours: 48,
    rush: null,
    acceptedFormats: [],
    photos: [
      {
        fileId: "file_1",
        sortOrder: 0,
        altText: "A printed flyer",
        url: "/catalog/media/file_1",
        downloadUrl: link,
        downloadUrlExpiresAt: expiresAt,
      },
    ],
    prepSteps: [],
    optionGroups: [],
    version: 1,
    serviceVersion: 1,
  };
}

const SHOP: ShopSummary = {
  supplierId: "user_shop",
  shopName: "A press the client never sees",
  shop: null,
  media: [],
  categories: ["marketing_collateral"],
  itemCount: 1,
};

function board(link: string, expiresAt: string): ShopBoard {
  return {
    supplierId: "user_shop",
    shopName: "A press the client never sees",
    shop: null,
    media: [],
    categories: ["marketing_collateral"],
    services: [
      {
        id: "svc",
        version: 1,
        categoryCode: "marketing_collateral",
        pricingBasis: "per_unit",
        turnaroundHours: 48,
        acceptedFormats: [],
        items: [flyers(link, expiresAt)],
      },
    ],
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

const photoLink = () => screen.getByTestId("sample-photo-image").props.source?.uri;

let now = START;
let appStateListeners: ((state: AppStateStatus) => void)[] = [];

beforeEach(() => {
  now = START;
  jest.spyOn(Date, "now").mockImplementation(() => now);
  appStateListeners = [];
  jest.spyOn(AppState, "addEventListener").mockImplementation((type, listener) => {
    if (type === "change") appStateListeners.push(listener as (state: AppStateStatus) => void);
    return {
      remove: () => {
        appStateListeners = appStateListeners.filter((entry) => entry !== listener);
      },
    };
  });
  clearBoardCache();
  usePlatformSettings.getState().reset();
  usePlatformSettings.getState().adopt({
    issueWindowHours: 24,
    serviceFeeRateBps: 1000,
    deliveryFeeBands: [{ maxDistanceMeters: null, feeMinor: 2500 }],
  });
  api.listOrders.mockReset();
  api.listOrders.mockResolvedValue([]);
  api.listCatalogShops.mockReset();
  api.listCatalogShops.mockResolvedValue([SHOP]);
  api.getCatalogShop.mockReset();
  useCart.getState().reset();
  useRequestDraft.getState().reset();
  useSession.setState({
    user: {
      id: "user_1",
      name: "Rina Cruz",
      email: "rina@example.com",
      role: "client",
      accountType: "business",
      orgName: "Cruz Signs",
    },
    token: "tok_test",
  } as never);
});

afterEach(() => {
  jest.restoreAllMocks();
});

/*
  Home's sample photos are signed for five minutes. A phone that sits in the
  background longer used to come back to three "This photo will not load"
  tiles (gridgo-client#111). Home now re-reads the boards instead.
*/
describe("Home sample photos and expiring links", () => {
  it("re-reads the boards once when a held photo link has already expired", async () => {
    api.getCatalogShop
      .mockResolvedValueOnce(board("https://storage.example/old", minutesFrom(START, -1)))
      .mockResolvedValue(board("https://storage.example/new", minutesFrom(START, 5)));

    await renderInSafeArea(<HomeScreen />);

    await waitFor(() => expect(photoLink()).toBe("https://storage.example/new"));
    // One board read for the strip, one forced re-read for the expired link.
    expect(api.getCatalogShop).toHaveBeenCalledTimes(2);
    expect(screen.queryByText("This photo will not load")).toBeNull();
  });

  it("re-reads on coming back to the app five minutes later", async () => {
    api.getCatalogShop
      .mockResolvedValueOnce(board("https://storage.example/first", minutesFrom(START, 5)))
      .mockResolvedValue(board("https://storage.example/after-resume", minutesFrom(START + 5 * 60_000, 5)));

    await renderInSafeArea(<HomeScreen />);
    await waitFor(() => expect(photoLink()).toBe("https://storage.example/first"));
    expect(api.getCatalogShop).toHaveBeenCalledTimes(1);

    // The phone sat in the background past the signing window.
    now = START + 5 * 60_000 + 1_000;
    appStateListeners.forEach((listener) => listener("active"));

    await waitFor(() => expect(photoLink()).toBe("https://storage.example/after-resume"));
    expect(api.getCatalogShop).toHaveBeenCalledTimes(2);
    expect(screen.queryByText("This photo will not load")).toBeNull();
  });

  it("does not re-read on a quick trip out of the app", async () => {
    api.getCatalogShop.mockResolvedValue(board("https://storage.example/first", minutesFrom(START, 5)));

    await renderInSafeArea(<HomeScreen />);
    await waitFor(() => expect(photoLink()).toBe("https://storage.example/first"));

    now = START + 60_000;
    appStateListeners.forEach((listener) => listener("active"));

    await waitFor(() => expect(api.listOrders).toHaveBeenCalled());
    expect(api.getCatalogShop).toHaveBeenCalledTimes(1);
  });
});
