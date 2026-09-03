import { render, screen, waitFor } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import HomeScreen from "@/app/(tabs)/home";
import type { CatalogItem, Order, ShopBoard, ShopSummary } from "@/lib/api";
import { clearBoardCache } from "@/lib/shopBoards";
import { useCart } from "@/store/cart";
import { useRequestDraft } from "@/store/requestDraft";
import { useSession } from "@/store/session";

const mockPush = jest.fn();

jest.mock("expo-router", () => ({
  router: { push: mockPush, replace: jest.fn(), back: jest.fn() },
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
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

function item(subcategoryCode: string, fromPriceMinor: number): CatalogItem {
  return {
    id: `sci_${subcategoryCode}`,
    supplierId: "user_shop",
    supplierServiceId: "svc",
    categoryCode: "marketing_collateral",
    subcategoryCode,
    name: subcategoryCode,
    description: null,
    basePriceMinor: fromPriceMinor,
    fromPriceMinor,
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
        downloadUrl: "https://storage.example/file_1",
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

const BOARD: ShopBoard = {
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
      items: [item("flyers", 45_000)],
    },
  ],
};

function order(): Order {
  return {
    id: "ord_1",
    clientId: "user_1",
    supplierId: null,
    riderId: null,
    state: "production",
    productId: "prod_tarpaulin",
    title: "Grand opening tarpaulin",
    quantity: 1,
    size: "3x6 ft",
    material: "13oz tarpaulin",
    deadline: null,
    address: "JP Laurel Ave, Davao City",
    zone: "davao_central",
    subtotalMinor: 110000,
    deliveryFeeMinor: 2500,
    totalMinor: 112500,
    downpaymentMinor: 84375,
    balanceMinor: 28125,
    paymentMethod: "qr_manual",
    paymentStatus: "unpaid",
    promisedDate: null,
    artworkName: null,
    createdAt: "2026-08-10T10:00:00.000Z",
    updatedAt: "2026-08-10T10:00:00.000Z",
    timeline: [],
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
  clearBoardCache();
  api.listOrders.mockReset();
  api.listOrders.mockResolvedValue([]);
  api.listCatalogShops.mockReset();
  api.listCatalogShops.mockResolvedValue([SHOP]);
  api.getCatalogShop.mockReset();
  api.getCatalogShop.mockResolvedValue(BOARD);
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

/**
 * A client with nothing on press is the one Home that has room to introduce
 * the platform. It gets a greeting and real printed work — not the grey empty
 * panel that used to sit here offering a button the board below already is.
 */
describe("Home with nothing on press", () => {
  it("greets the client and shows work GRIDGO is printing today", async () => {
    await renderInSafeArea(<HomeScreen />);

    expect(await screen.findByText("Hello, Rina")).toBeTruthy();
    expect(
      screen.getByText("Nothing on press yet. Choose what you need and GRIDGO finds the printer."),
    ).toBeTruthy();

    expect(await screen.findByText("ON PRESS TODAY")).toBeTruthy();
    expect(await screen.findByText("Flyers")).toBeTruthy();
    expect(screen.getByText(/^From ₱/)).toBeTruthy();

    // GRIDGO is the counter: matching picks the press later, and no client
    // surface names one.
    expect(screen.queryByText(/A press the client never sees/)).toBeNull();
  });

  it("leaves the strip out rather than showing an empty shelf", async () => {
    api.listCatalogShops.mockResolvedValue([]);

    await renderInSafeArea(<HomeScreen />);

    expect(await screen.findByText("Hello, Rina")).toBeTruthy();
    await waitFor(() => expect(api.listCatalogShops).toHaveBeenCalled());
    expect(screen.queryByText("ON PRESS TODAY")).toBeNull();
    expect(await screen.findByText("START A PRINT")).toBeTruthy();
  });

  it("says none of it once the client has a job, and reads no boards at all", async () => {
    api.listOrders.mockResolvedValue([order()]);

    await renderInSafeArea(<HomeScreen />);

    expect(await screen.findByText("Grand opening tarpaulin")).toBeTruthy();
    expect(screen.queryByText("Hello, Rina")).toBeNull();
    expect(screen.queryByText("ON PRESS TODAY")).toBeNull();
    expect(api.listCatalogShops).not.toHaveBeenCalled();
  });
});
