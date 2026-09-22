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
 * The captain's report was that "Add to my order" sat on "Saving…" too long.
 *
 * It was two round trips deep — create the basket, then put the line in it —
 * and only the second has anything to do with what was just chosen. These
 * pin the fix: the basket is created while the client is still reading the
 * sheet, and the tap does one call and leaves.
 */
describe("adding a listing to the order", () => {
  it("creates the basket while the sheet is being read, not when it is tapped", async () => {
    await renderInSafeArea(<ListingScreen />);

    await waitFor(() => expect(api.createCart).toHaveBeenCalledTimes(1));
    expect(useCart.getState().cartId).toBe("cart_1");
    // Nothing has been added yet — this is only the basket being got ready.
    expect(api.addCartLine).not.toHaveBeenCalled();
  });

  it("does not create a second basket when the phone already holds one", async () => {
    useCart.setState({ cartId: "cart_existing" });
    await renderInSafeArea(<ListingScreen />);

    await screen.findByText("Add to my order");
    expect(api.createCart).not.toHaveBeenCalled();
  });

  it("leaves for artwork on the one call the tap actually needs", async () => {
    await renderInSafeArea(<ListingScreen />);
    await waitFor(() => expect(api.createCart).toHaveBeenCalled());

    await fireEvent.press(screen.getByLabelText("Add to my order"));

    await waitFor(() =>
      expect(mockReplace).toHaveBeenCalledWith({
        pathname: "/request/artwork",
        params: { lineId: "cline_new" },
      }),
    );
    expect(api.addCartLine).toHaveBeenCalledTimes(1);
    // Compact add is enough to leave. A fat cart re-read or photo signing
    // would keep the yellow control on "Saving…".
    expect(api.getCart).not.toHaveBeenCalled();
    expect(api.getCatalogItem).not.toHaveBeenCalled();
    expect(useCart.getState().cart?.lines[0]?.id).toBe("cline_new");
  });
});
