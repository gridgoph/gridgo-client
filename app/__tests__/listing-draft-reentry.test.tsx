import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import ListingScreen from "@/app/request/listing";
import type { CatalogItem, CatalogOptionGroup } from "@/lib/api";
import { clearListingCache, rememberListing } from "@/lib/listingCache";
import { useCart } from "@/store/cart";
import { useListingDraft } from "@/store/listingDraft";

/**
 * Stepping away from an order sheet and opening it again keeps what was
 * answered and not yet added: the size typed, the quantity, the option.
 */

jest.mock("expo-router", () => ({
  useFocusEffect: (effect: () => void) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useEffect } = require("react");
    useEffect(effect, [effect]);
  },
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), dismissTo: jest.fn() }),
  useLocalSearchParams: () => ({ itemId: "sci_tarp" }),
}));

jest.mock("@/lib/api", () => {
  const actual = jest.requireActual("@/lib/api");
  return { ...actual, getCatalogItem: jest.fn(), getSettings: jest.fn(), createCart: jest.fn() };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require("@/lib/api");

const ITEM: CatalogItem = {
  id: "sci_tarp",
  supplierId: "user_shop",
  supplierServiceId: "svc",
  categoryCode: "marketing_collateral",
  subcategoryCode: "flyers",
  name: "Tarpaulin",
  description: "Single sheets for events",
  basePriceMinor: 2200,
  fromPriceMinor: 2200,
  effectivePriceMinor: null,
  pricingUnit: "per_area",
  packageQty: null,
  measurementKind: "area" as const,
  measureUnit: "ft",
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

function renderSheet() {
  return render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 47, left: 0, right: 0, bottom: 34 },
      }}
    >
      <ListingScreen />
    </SafeAreaProvider>,
  );
}

beforeEach(() => {
  clearListingCache();
  useListingDraft.getState().clear();
  useCart.getState().reset();
  useCart.setState({ cartId: "cart_existing" });
  api.getCatalogItem.mockReturnValue(new Promise(() => {}));
  api.getSettings.mockResolvedValue({ serviceFeeRateBps: 4_500, issueWindowHours: 24, deliveryFeeBands: [] });
});

it("opens again on the size, quantity and option already given", async () => {
  rememberListing(ITEM);
  const first = await renderSheet();
  await screen.findByText("Add to my order");

  await fireEvent.press(screen.getByLabelText("Gloss, Paper"));
  await fireEvent.changeText(screen.getByLabelText("How wide it is"), "6");
  await fireEvent.changeText(screen.getByLabelText("How tall it is"), "3");
  await fireEvent.press(screen.getByLabelText("One more"));
  await waitFor(() => expect(screen.getByText("2")).toBeTruthy());
  await first.unmount();

  await renderSheet();
  await screen.findByText("Add to my order");
  expect(screen.getByLabelText("Gloss, Paper").props.accessibilityState.checked).toBe(true);
  expect(screen.getByDisplayValue("6")).toBeTruthy();
  expect(screen.getByDisplayValue("3")).toBeTruthy();
  expect(screen.getByText("2")).toBeTruthy();
});
