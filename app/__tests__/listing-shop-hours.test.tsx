import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import type { ReactElement } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import ListingScreen from "@/app/request/listing";
import type { CatalogItem } from "@/lib/api";
import { clearListingCache, rememberListing } from "@/lib/listingCache";
import { useCart } from "@/store/cart";

const mockReplace = jest.fn();

jest.mock("expo-router", () => ({
  useFocusEffect: (effect: () => void) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useEffect } = require("react");
    useEffect(effect, [effect]);
  },
  useRouter: () => ({
    push: jest.fn(),
    replace: mockReplace,
    navigate: jest.fn(),
    back: jest.fn(),
  }),
  useLocalSearchParams: () => ({ itemId: "sci_flyers" }),
}));

jest.mock("@/lib/api", () => {
  const actual = jest.requireActual("@/lib/api");
  return {
    ...actual,
    getCatalogItem: jest.fn(),
    getSettings: jest.fn(),
    createCart: jest.fn(),
    addCartLine: jest.fn(),
    getCart: jest.fn(),
  };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require("@/lib/api");

const ITEM: CatalogItem = {
  id: "sci_flyers",
  supplierId: "user_shop",
  supplierServiceId: "svc",
  categoryCode: "marketing_collateral",
  subcategoryCode: "flyers",
  name: "Flyers",
  description: null,
  basePriceMinor: 2200,
  fromPriceMinor: 2200,
  effectivePriceMinor: null,
  pricingUnit: "per_package",
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
  turnaroundMode: "override",
  turnaroundHours: 12,
  rush: null,
  acceptedFormats: [],
  photos: [],
  prepSteps: [],
  optionGroups: [],
  version: 1,
  serviceVersion: 1,
};

let shopHours: CatalogItem["shopHours"] = null;
const ITEM_UNDER_TEST = (): CatalogItem => ({ ...ITEM, shopHours });

const CART = {
  id: "cart_1",
  state: "draft" as const,
  version: 1,
  serviceLevel: "standard" as const,
  scheduledFor: null,
  fulfillmentMode: "delivery" as const,
  defaultDropoff: null,
  lines: [],
  checkedOutOrderId: null,
  createdAt: "2026-08-24T00:00:00.000Z",
  updatedAt: "2026-08-24T00:00:00.000Z",
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
  mockReplace.mockClear();
  api.getCatalogItem.mockClear();
  api.getSettings.mockReset();
  api.getSettings.mockResolvedValue({
    serviceFeeRateBps: 1_000,
    issueWindowHours: 24,
    deliveryFeeBands: [],
  });
  api.createCart.mockClear();
  api.addCartLine.mockClear();
  api.getCart.mockClear();
  clearListingCache();
  useCart.getState().reset();
  rememberListing(ITEM_UNDER_TEST());
  api.getCatalogItem.mockReturnValue(new Promise(() => {}));
  api.createCart.mockResolvedValue(CART);
  api.addCartLine.mockResolvedValue({
    ...CART,
    lines: [
      {
        id: "cline_new",
        supplierId: "user_shop",
        catalogItemId: "sci_flyers",
        quantity: 1,
        optionIds: [],
        structuredSpec: {},
        artworkFileId: null,
        mockupFileId: null,
        dropoff: null,
        sortOrder: 0,
        listing: {
          id: "sci_flyers",
          name: "Flyers",
          supplierId: "user_shop",
          fromPriceMinor: 2200,
          effectivePriceMinor: 2200,
          selectedOptions: [],
        } as unknown as CatalogItem,
        lineSubtotalMinor: 2200,
      },
    ],
  });
});

/**
 * A shop's hours on the order sheet (gridgo-api#219). Closed tonight still
 * takes the order; closed for now does not, and the sheet says so before the
 * tap rather than leaving it to a refusal at checkout.
 */
describe("the shop's hours on the order sheet", () => {
  it("says when a closed shop opens and still lets the order in", async () => {
    shopHours = {
      isOpenNow: false,
      temporarilyClosed: false,
      calendarAvailable: true,
      nextOpeningAt: new Date(Date.now() + 3 * 60 * 60_000).toISOString(),
    };
    rememberListing(ITEM_UNDER_TEST());
    await renderInSafeArea(<ListingScreen />);

    expect(await screen.findByText(/^Closed · opens /)).toBeTruthy();
    expect(screen.getByLabelText("Add to my order")).not.toBeDisabled();
  });

  it("says open now", async () => {
    shopHours = { isOpenNow: true, temporarilyClosed: false, calendarAvailable: true, nextOpeningAt: new Date().toISOString() };
    rememberListing(ITEM_UNDER_TEST());
    await renderInSafeArea(<ListingScreen />);

    expect(await screen.findByText("Open now")).toBeTruthy();
  });

  // Presses, so it goes last in this file.
  it("will not add a listing from a shop closed for now, and says why", async () => {
    shopHours = { isOpenNow: false, temporarilyClosed: true, calendarAvailable: true, nextOpeningAt: null };
    rememberListing(ITEM_UNDER_TEST());
    await renderInSafeArea(<ListingScreen />);

    expect(await screen.findByText("Closed for now")).toBeTruthy();
    expect(screen.getByText(/closed for now and is not taking new orders/)).toBeTruthy();
    const add = screen.getByLabelText("Add to my order");
    expect(add).toBeDisabled();
    await fireEvent.press(add);
    expect(api.addCartLine).not.toHaveBeenCalled();
  });
});
