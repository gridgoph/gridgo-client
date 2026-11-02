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
import { useListingDraft } from "@/store/listingDraft";

const mockReplace = jest.fn();
let mockParams: Record<string, string> = { itemId: "sci_flyers" };

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
  useLocalSearchParams: () => mockParams,
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
  // The shop sells one sample piece first (gridgo-api#222).
  sampleAvailable: true,
  samplePriceMinor: 5000,
  clientSamplePriceMinor: 5500,
};

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
  useListingDraft.getState().clear();
  useCart.getState().reset();
  mockParams = { itemId: "sci_flyers" };
  rememberListing(ITEM);
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
 * "Order a sample first" beside the order button (gridgo-api#222): shown only
 * where the shop offers a sample, at GRIDGO's sample price, and it adds the
 * line with `sample: true` carrying the intended batch quantity.
 */
describe("ordering a sample first", () => {
  it("shows no sample button where the shop offers none", async () => {
    rememberListing({ ...ITEM, sampleAvailable: false, samplePriceMinor: null, clientSamplePriceMinor: null });
    await renderInSafeArea(<ListingScreen />);
    expect(await screen.findByRole("button", { name: "Add to my order" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Order a sample/ })).toBeNull();
  });

  it("offers the sample beside the order button at GRIDGO's sample price", async () => {
    await renderInSafeArea(<ListingScreen />);
    expect(await screen.findByRole("button", { name: "Add to my order" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Order a sample first · ₱55.00" })).toBeTruthy();
    expect(screen.getByText(/You pay for one sample piece now, plus delivery\. The batch above is saved/)).toBeTruthy();
  });

  it("leads with the sample when the client came for one, keeping the batch size", async () => {
    mockParams = { itemId: "sci_flyers", sample: "1", quantity: "500" };
    await renderInSafeArea(<ListingScreen />);
    expect(await screen.findByRole("button", { name: "Order a sample" })).toBeTruthy();
    expect(screen.getByText("Order a sample · ₱55.00")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Add the full batch instead" })).toBeTruthy();
    // The batch the sample stands for is the quantity on the sheet, kept from the sample page.
    expect(screen.getAllByText(/^500 (packs|pieces)/).length).toBeGreaterThan(0);
  });

  it("adds the sample line with the intended batch, then goes to artwork", async () => {
    mockParams = { itemId: "sci_flyers", sample: "1", quantity: "500", replaces: "sbd_old" };
    await renderInSafeArea(<ListingScreen />);
    await waitFor(() => expect(useCart.getState().cartId).toBe("cart_1"));

    fireEvent.press(await screen.findByRole("button", { name: "Order a sample" }));

    await waitFor(() => expect(api.addCartLine).toHaveBeenCalledTimes(1));
    expect(api.addCartLine).toHaveBeenCalledWith(
      "cart_1",
      expect.objectContaining({
        catalogItemId: "sci_flyers",
        quantity: 500,
        sample: true,
        replacesSampleBatchId: "sbd_old",
      }),
    );
    await waitFor(() =>
      expect(mockReplace).toHaveBeenCalledWith({ pathname: "/request/artwork", params: { lineId: "cline_new" } }),
    );
  });
});
