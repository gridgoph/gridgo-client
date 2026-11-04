import { fireEvent, render, screen, within } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import ListingScreen from "@/app/request/listing";
import type { CatalogItem, CatalogOptionGroup } from "@/lib/api";
import { clearListingCache, rememberListing } from "@/lib/listingCache";
import { useCart } from "@/store/cart";
import { useListingDraft } from "@/store/listingDraft";
import { usePlatformSettings } from "@/store/platformSettings";

jest.mock("expo-router", () => ({
  useFocusEffect: (effect: () => void) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useEffect } = require("react");
    useEffect(effect, [effect]);
  },
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({ itemId: "sci_flyers" }),
}));

jest.mock("@/lib/api", () => {
  const actual = jest.requireActual("@/lib/api");
  return {
    ...actual,
    getCatalogItem: jest.fn(),
    catalogQuote: jest.fn(),
  };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require("@/lib/api");

const SIZE: CatalogOptionGroup = {
  id: "g_size",
  name: "Size",
  kind: "spec",
  helpText: null,
  required: true,
  selectionMode: "single",
  sortOrder: 0,
  version: 1,
  options: [
    { id: "o_a5", label: "A5", priceModifierMinor: 0, specBinding: { fieldCode: "size", value: "A5" }, sortOrder: 0 },
  ],
};

const PAPER: CatalogOptionGroup = {
  id: "g_paper",
  name: "Paper",
  kind: "spec",
  helpText: null,
  required: true,
  selectionMode: "single",
  sortOrder: 1,
  version: 1,
  options: [
    { id: "o_matte", label: "Matte", priceModifierMinor: 0, specBinding: { fieldCode: "material", valueCode: "matte" }, sortOrder: 0 },
  ],
};

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
  turnaroundHours: 12,
  rush: null,
  acceptedFormats: [],
  photos: [],
  prepSteps: [],
  optionGroups: [SIZE, PAPER],
  version: 1,
  serviceVersion: 1,
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
  clearListingCache();
  useListingDraft.getState().clear();
  useCart.getState().reset();
  api.getCatalogItem.mockReset();
  api.getCatalogItem.mockReturnValue(new Promise(() => {}));
  usePlatformSettings.getState().reset();
  usePlatformSettings.getState().adopt({
    issueWindowHours: 24,
    serviceFeeRateBps: 1000,
    deliveryFeeBands: [{ maxDistanceMeters: null, feeMinor: 2500 }],
  });
});

it("marks the first missing choice on the field after Add, not only under the button", async () => {
  rememberListing(ITEM);
  await renderInSafeArea(<ListingScreen />);
  await screen.findByText("Add to my order");

  expect(screen.queryByText("Pick a size first.")).toBeNull();
  await fireEvent.press(screen.getByLabelText("Add to my order"));

  const size = screen.getByTestId("listing-field-group:g_size");
  expect(within(size).getByText("Pick a size first.")).toBeTruthy();
  expect(screen.getByTestId("option-group-g_size").props.className).toMatch(/border-error/);
  expect(within(screen.getByTestId("listing-field-group:g_paper")).getByText("Pick a paper first.")).toBeTruthy();
  expect(screen.getByText("Delivery is added at checkout.")).toBeTruthy();
});
