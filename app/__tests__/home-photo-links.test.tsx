import { render, screen, waitFor } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import HomeScreen from "@/app/(tabs)/home";
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
    getFeaturedPrints: jest.fn(async () => ({ items: [] })),
  };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require("@/lib/api");

const START = Date.parse("2026-09-27T08:00:00.000Z");
const minutesFrom = (base: number, minutes: number) =>
  new Date(base + minutes * 60_000).toISOString();

/** A `GET /featured-prints` body with one curated card. */
function featured(link: string, expiresAt: string) {
  return {
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
        photos: [
          {
            fileId: "file_1",
            sortOrder: 0,
            url: "/catalog/media/file_1",
            downloadUrl: link,
            downloadUrlExpiresAt: expiresAt,
          },
        ],
      },
    ],
    emptyState: null,
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
  usePlatformSettings.getState().reset();
  usePlatformSettings.getState().adopt({
    issueWindowHours: 24,
    serviceFeeRateBps: 1000,
    deliveryFeeBands: [{ maxDistanceMeters: null, feeMinor: 2500 }],
  });
  api.listOrders.mockReset();
  api.listOrders.mockResolvedValue([]);
  api.getFeaturedPrints.mockReset();
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
  tiles (gridgo-client#111). Home now re-reads FEATURED PRINTS instead.
*/
describe("Home sample photos and expiring links", () => {
  it("re-reads the list once when a held photo link has already expired", async () => {
    api.getFeaturedPrints
      .mockResolvedValueOnce(featured("https://storage.example/old", minutesFrom(START, -1)))
      .mockResolvedValue(featured("https://storage.example/new", minutesFrom(START, 5)));

    await renderInSafeArea(<HomeScreen />);

    await waitFor(() => expect(photoLink()).toBe("https://storage.example/new"));
    // One read for the row, one re-read for the expired link.
    expect(api.getFeaturedPrints).toHaveBeenCalledTimes(2);
    expect(screen.queryByText("This photo will not load")).toBeNull();
  });

  it("re-reads on coming back to the app five minutes later", async () => {
    api.getFeaturedPrints
      .mockResolvedValueOnce(featured("https://storage.example/first", minutesFrom(START, 5)))
      .mockResolvedValue(featured("https://storage.example/after-resume", minutesFrom(START + 5 * 60_000, 5)));

    await renderInSafeArea(<HomeScreen />);
    await waitFor(() => expect(photoLink()).toBe("https://storage.example/first"));
    expect(api.getFeaturedPrints).toHaveBeenCalledTimes(1);

    // The phone sat in the background past the signing window.
    now = START + 5 * 60_000 + 1_000;
    appStateListeners.forEach((listener) => listener("active"));

    await waitFor(() => expect(photoLink()).toBe("https://storage.example/after-resume"));
    expect(api.getFeaturedPrints).toHaveBeenCalledTimes(2);
    expect(screen.queryByText("This photo will not load")).toBeNull();
  });

  it("does not re-read on a quick trip out of the app", async () => {
    api.getFeaturedPrints.mockResolvedValue(featured("https://storage.example/first", minutesFrom(START, 5)));

    await renderInSafeArea(<HomeScreen />);
    await waitFor(() => expect(photoLink()).toBe("https://storage.example/first"));

    now = START + 60_000;
    appStateListeners.forEach((listener) => listener("active"));

    await waitFor(() => expect(api.listOrders).toHaveBeenCalled());
    expect(api.getFeaturedPrints).toHaveBeenCalledTimes(1);
  });
});
