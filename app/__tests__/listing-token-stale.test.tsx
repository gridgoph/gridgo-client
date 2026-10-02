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
import {
  clearMatchSelections,
  holdMatchSelection,
  matchIsSpent,
} from "@/lib/matchSelection";
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
  clearMatchSelections();
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
 * A pick GRIDGO refuses as out of date — the token's fifteen minutes ran out,
 * or the listing or its queue moved — adds nothing, says so in words, and
 * sends the client back to a match that will ask again. Its own file: the
 * error is a state write after an async refusal (AGENTS.md).
 */
describe("a pick that has gone out of date", () => {
  it("says the match is out of date and offers the way back to it", async () => {
    holdMatchSelection("sci_flyers", {
      matchRequestId: "req_match_old",
      selectToken: "tok_expired",
      expiresAt: "2026-10-02T00:00:00.000Z",
    });
    api.addCartLine.mockRejectedValue(
      new api.ApiError(410, { error: "select_token_expired", message: "This selection expired; match again." }),
    );
    await renderInSafeArea(<ListingScreen />);
    await waitFor(() => expect(api.createCart).toHaveBeenCalled());

    await fireEvent.press(screen.getByLabelText("Add to my order"));

    expect(await screen.findByText(/This match is out of date/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Back to the match" })).toBeTruthy();
    expect(mockReplace).not.toHaveBeenCalled();
    // The match screen reads this on focus and asks GRIDGO again.
    expect(matchIsSpent("req_match_old")).toBe(true);
  });
});
