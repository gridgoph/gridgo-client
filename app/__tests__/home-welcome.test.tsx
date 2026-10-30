import { render, screen, waitFor } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import HomeScreen from "@/app/(tabs)/home";
import type { Order } from "@/lib/api";
import { useCart } from "@/store/cart";
import { useRequestDraft } from "@/store/requestDraft";
import { useSession } from "@/store/session";
import { usePlatformSettings } from "@/store/platformSettings";

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
    getFeaturedPrints: jest.fn(async () => ({ items: [] })),
    listCatalogShops: jest.fn(async () => ({ shops: [], complete: true })),
  };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require("@/lib/api");

/**
 * `GET /featured-prints` as gridgo-api sends it. Even a card that arrived
 * carrying a shop must not draw one.
 */
const FEATURED = {
  title: "FEATURED PRINTS",
  items: [
    {
      id: "sci_flyers",
      name: "Flyers",
      categoryCode: "marketing_collateral",
      subcategoryCode: "flyers",
      clientFromPriceMinor: 49_500,
      pricingUnit: "per_unit",
      packageQty: null,
      measureUnit: null,
      minimumOrderQuantity: null,
      shopName: "A press the client never sees",
      photos: [
        {
          fileId: "file_1",
          sortOrder: 0,
          url: "/catalog/media/file_1",
          downloadUrl: "https://storage.example/file_1",
        },
      ],
    },
  ],
  emptyState: null,
};

const EMPTY = {
  title: "FEATURED PRINTS",
  items: [],
  emptyState: {
    action: "browse_catalog",
    message: "Explore print products to start your first print.",
  },
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
  usePlatformSettings.getState().reset();
  usePlatformSettings.getState().adopt({
    issueWindowHours: 24,
    serviceFeeRateBps: 1000,
    deliveryFeeBands: [{ maxDistanceMeters: null, feeMinor: 2500 }],
  });
  api.listOrders.mockReset();
  api.listOrders.mockResolvedValue([]);
  api.getFeaturedPrints.mockReset();
  api.getFeaturedPrints.mockResolvedValue(FEATURED);
  api.listCatalogShops.mockReset();
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
 * the platform. It gets a greeting and FEATURED PRINTS — GRIDGO's curated
 * products, never what other clients are printing (reports 36D13C56 and
 * C0266B02).
 */
describe("Home with nothing on press", () => {
  it("greets the client and shows GRIDGO's featured prints", async () => {
    await renderInSafeArea(<HomeScreen />);

    expect(await screen.findByText("Hello, Rina")).toBeTruthy();
    expect(screen.getByText("Choose what you need and GRIDGO finds the printer.")).toBeTruthy();
    expect(screen.queryByText(/on press/i)).toBeNull();

    expect(await screen.findByText("FEATURED PRINTS")).toBeTruthy();
    expect(screen.queryByText("ON PRESS TODAY")).toBeNull();
    expect(await screen.findByText("Flyers")).toBeTruthy();
    // GRIDGO's figure as sent, fee already inside.
    expect(screen.getByText("From ₱495.00")).toBeTruthy();

    // GRIDGO is the counter: matching picks the press later, and no client
    // surface names one. The row is curated, so no shop board is read for it.
    expect(screen.queryByText(/A press the client never sees/)).toBeNull();
    expect(api.listCatalogShops).not.toHaveBeenCalled();
  });

  it("leaves the row out on the contract's empty state, keeping the start board", async () => {
    api.getFeaturedPrints.mockResolvedValue(EMPTY);

    await renderInSafeArea(<HomeScreen />);

    expect(await screen.findByText("Hello, Rina")).toBeTruthy();
    await waitFor(() => expect(api.getFeaturedPrints).toHaveBeenCalled());
    expect(screen.queryByText("FEATURED PRINTS")).toBeNull();
    expect(await screen.findByText("START YOUR FIRST PRINT")).toBeTruthy();
    // Never a fallback to the shops' live boards.
    expect(api.listCatalogShops).not.toHaveBeenCalled();
  });

  it("leaves the row out when the list cannot be read, and reads nothing in its place", async () => {
    api.getFeaturedPrints.mockRejectedValue(new Error("offline"));

    await renderInSafeArea(<HomeScreen />);

    expect(await screen.findByText("START YOUR FIRST PRINT")).toBeTruthy();
    await waitFor(() => expect(api.getFeaturedPrints).toHaveBeenCalled());
    expect(screen.queryByText("FEATURED PRINTS")).toBeNull();
    expect(api.listCatalogShops).not.toHaveBeenCalled();
  });

  it("drops the greeting once the client has a job, and still reads the featured list", async () => {
    api.listOrders.mockResolvedValue([order()]);

    await renderInSafeArea(<HomeScreen />);

    expect(await screen.findByText("Grand opening tarpaulin")).toBeTruthy();
    expect(screen.queryByText("Hello, Rina")).toBeNull();
    expect(await screen.findByText("Flyers")).toBeTruthy();
  });
});

/**
 * FEATURED PRINTS used to be read only for a client with nothing on press, so
 * the list staff curate never reached a returning client (report 876B533C).
 * It is now on every Home, after the jobs: nothing waiting on the client is
 * pushed below it.
 */
describe("FEATURED PRINTS for a returning client", () => {
  function finished(index: number): Order {
    return {
      ...order(),
      id: `ord_done_${index}`,
      title: `Finished job ${index}`,
      state: "completed",
      updatedAt: `2026-08-1${index}T10:00:00.000Z`,
    };
  }

  it("shows the row below a job in progress", async () => {
    api.listOrders.mockResolvedValue([order()]);

    await renderInSafeArea(<HomeScreen />);

    expect(await screen.findByText("FEATURED PRINTS")).toBeTruthy();
    expect(screen.getByText("IN PROGRESS")).toBeTruthy();
    // Drawn after the job in the column, never above it.
    const column = screen
      .getAllByText(/^(Grand opening tarpaulin|FEATURED PRINTS)$/)
      .map((node) => node.props.children);
    expect(column).toEqual(["Grand opening tarpaulin", "FEATURED PRINTS"]);
    expect(screen.getByText("START A PRINT")).toBeTruthy();
  });

  it("shows the row to a client with only finished jobs, under the latest two of them", async () => {
    api.listOrders.mockResolvedValue([finished(1), finished(2), finished(3), finished(4)]);

    await renderInSafeArea(<HomeScreen />);

    expect(await screen.findByText("FEATURED PRINTS")).toBeTruthy();
    expect(await screen.findByText("Flyers")).toBeTruthy();
    expect(screen.getByText("RECENTLY FINISHED")).toBeTruthy();
    // The two that finished last, not the first two the API listed.
    expect(screen.getByText("Finished job 4")).toBeTruthy();
    expect(screen.getByText("Finished job 3")).toBeTruthy();
    expect(screen.queryByText("Finished job 2")).toBeNull();
    expect(screen.queryByText("Finished job 1")).toBeNull();
    // The rest are on Orders.
    expect(screen.getByLabelText("View all 4 jobs")).toBeTruthy();
    expect(screen.queryByText("Hello, Rina")).toBeNull();
  });

  it("leaves the row out for a returning client when the curated list is empty", async () => {
    api.listOrders.mockResolvedValue([order()]);
    api.getFeaturedPrints.mockResolvedValue(EMPTY);

    await renderInSafeArea(<HomeScreen />);

    expect(await screen.findByText("Grand opening tarpaulin")).toBeTruthy();
    await waitFor(() => expect(api.getFeaturedPrints).toHaveBeenCalled());
    expect(screen.queryByText("FEATURED PRINTS")).toBeNull();
    expect(screen.getByText("START A PRINT")).toBeTruthy();
    expect(api.listCatalogShops).not.toHaveBeenCalled();
  });
});
