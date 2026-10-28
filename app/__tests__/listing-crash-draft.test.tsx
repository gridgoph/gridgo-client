import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { Try } from "expo-router/build/views/Try";
import { SafeAreaProvider } from "react-native-safe-area-context";

import ListingScreen, { ErrorBoundary } from "@/app/request/listing";
import type { CatalogItem, CatalogOptionGroup } from "@/lib/api";
import { clearListingCache, rememberListing } from "@/lib/listingCache";
import { useCart } from "@/store/cart";
import { useListingDraft } from "@/store/listingDraft";

/**
 * A crash on the order sheet is caught by its boundary, which unmounts the
 * sheet and draws it afresh on "Try again". What the client had ticked and
 * typed but not yet added must come back with it.
 */

let mockFail = false;
jest.mock("@/components/OptionGroupPicker", () => {
  const actual = jest.requireActual("@/components/OptionGroupPicker");
  return {
    ...actual,
    OptionGroupPicker: (props: Record<string, unknown>) => {
      if (mockFail) throw new Error("injected render failure");
      return <actual.OptionGroupPicker {...props} />;
    },
  };
});

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
  printLayouts: ["fit_to_paper", "actual_size_centered"],
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

const FIT = "Fit to paper. Scaled up or down to fill the paper.";

beforeEach(() => {
  clearListingCache();
  useListingDraft.getState().clear();
  useCart.getState().reset();
  useCart.setState({ cartId: "cart_existing" });
  api.getCatalogItem.mockResolvedValue(ITEM);
  api.getSettings.mockResolvedValue({ serviceFeeRateBps: 4_500, issueWindowHours: 24, deliveryFeeBands: [] });
});

it("brings back the ticked option, the note and the layout after Try again", async () => {
  const consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
  rememberListing(ITEM);
  const view = await render(tree);
  await screen.findByText("Add to my order");

  await fireEvent.press(screen.getByLabelText("Gloss, Paper"));
  await fireEvent.changeText(screen.getByLabelText("Special instructions for this item"), "Trim the white edge");
  await fireEvent.press(screen.getByLabelText(FIT));
  await waitFor(() => {
    expect(screen.getByLabelText("Gloss, Paper").props.accessibilityState.checked).toBe(true);
    expect(screen.getByLabelText(FIT).props.accessibilityState.checked).toBe(true);
    expect(screen.getByDisplayValue("Trim the white edge")).toBeTruthy();
  });

  mockFail = true;
  await view.rerender(tree);
  expect(await screen.findByText("Something went wrong")).toBeTruthy();

  mockFail = false;
  await fireEvent.press(screen.getByText("Try again"));
  await screen.findByText("Add to my order");

  expect(useCart.getState().cartId).toBe("cart_existing");
  expect(screen.getByLabelText("Gloss, Paper").props.accessibilityState.checked).toBe(true);
  expect(screen.getByLabelText(FIT).props.accessibilityState.checked).toBe(true);
  expect(screen.getByDisplayValue("Trim the white edge")).toBeTruthy();
  consoleError.mockRestore();
});
