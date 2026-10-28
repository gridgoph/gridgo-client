import { fireEvent, render, screen } from "@testing-library/react-native";
import { Try } from "expo-router/build/views/Try";
import { SafeAreaProvider } from "react-native-safe-area-context";

import ListingScreen, { ErrorBoundary } from "@/app/request/listing";
import type { CatalogItem, CatalogOptionGroup } from "@/lib/api";
import { clearListingCache, rememberListing } from "@/lib/listingCache";
import { useCart } from "@/store/cart";

/**
 * Try again on the order sheet, when the listing cannot be read again either.
 * Must not draw the same cached answer that threw. The bad group name is an injected, out-of-contract fault — not
 * observed production data — standing in for any bad held listing the
 * server has since corrected.
 */

jest.mock("expo-router", () => ({
  useFocusEffect: (effect: () => void) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useEffect } = require("react");
    useEffect(effect, [effect]);
  },
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), dismissTo: jest.fn() }),
  useLocalSearchParams: () => ({ itemId: "sci_flyers" }),
}));

jest.mock("@/lib/api", () => {
  const actual = jest.requireActual("@/lib/api");
  return { ...actual, getCatalogItem: jest.fn(), getSettings: jest.fn(), createCart: jest.fn() };
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
  description: "Single sheets for events",
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
  turnaroundDays: 2,
  turnaroundHours: 20,
  rush: null,
  acceptedFormats: [],
  photos: [],
  prepSteps: [],
  optionGroups: [
    {
      id: "grp_paper",
      name: "Paper",
      kind: "spec",
      helpText: null,
      required: true,
      selectionMode: "single",
      sortOrder: 0,
      version: 1,
      options: [{ id: "opt_gloss", label: "Gloss", priceModifierMinor: 0, specBinding: null, sortOrder: 0 }],
    } satisfies CatalogOptionGroup,
  ],
  version: 1,
  serviceVersion: 1,
};

const tree = (
  <SafeAreaProvider
    initialMetrics={{
      frame: { x: 0, y: 0, width: 390, height: 844 },
      insets: { top: 47, left: 0, right: 0, bottom: 34 },
    }}
  >
    <Try catch={ErrorBoundary}>
      <ListingScreen />
    </Try>
  </SafeAreaProvider>
);

beforeEach(() => {
  clearListingCache();
  useCart.getState().reset();
  useCart.setState({ cartId: "cart_existing" });
  api.getSettings.mockResolvedValue({ serviceFeeRateBps: 4_500, issueWindowHours: 24, deliveryFeeBands: [] });
});

it("says the listing did not open, with a way back, when the fresh read fails too", async () => {
  const consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
  api.getCatalogItem.mockRejectedValue(new Error("network down"));
  const broken = { ...ITEM, optionGroups: [{ ...ITEM.optionGroups[0], name: null }] } as unknown as CatalogItem;
  rememberListing(broken);

  await render(tree);
  expect(await screen.findByText("Something went wrong")).toBeTruthy();

  await fireEvent.press(screen.getByText("Try again"));

  // The sheet's own error, with its own retry; the header's back still works.
  expect(await screen.findByText("This listing did not open")).toBeTruthy();
  expect(screen.queryByText("Something went wrong")).toBeNull();
  expect(api.getCatalogItem).toHaveBeenCalledWith("sci_flyers");
  consoleError.mockRestore();
});
