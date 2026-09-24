import { fireEvent, render, screen } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import ListingScreen from "@/app/request/listing";
import type { CatalogItem, CatalogOptionGroup } from "@/lib/api";
import { clearListingCache, rememberListing } from "@/lib/listingCache";
import { useCart } from "@/store/cart";
import { usePlatformSettings } from "@/store/platformSettings";

jest.mock("@/lib/api", () => {
  const actual = jest.requireActual("@/lib/api");
  return {
    ...actual,
    getCatalogItem: jest.fn(),
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
  turnaroundHours: 12,
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
      options: [
        {
          id: "opt_gloss",
          label: "Gloss",
          priceModifierMinor: 0,
          specBinding: null,
          sortOrder: 0,
        },
      ],
    } satisfies CatalogOptionGroup,
  ],
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

/*
  A tarpaulin shop whose press takes a roll no wider than 7 ft. GRIDGO refuses
  a wider line with `printer_cap_exceeded`, so the sheet says so while the
  client is still typing the size (gridgoph/gridgo-client#73).
*/
const TARP: CatalogItem = {
  ...ITEM,
  id: "sci_tarp",
  categoryCode: "marketing_collateral",
  subcategoryCode: "tarpaulins_outdoor_banners",
  name: "Tarpaulin",
  basePriceMinor: 1800,
  fromPriceMinor: 1800,
  pricingUnit: "per_area",
  packageQty: null,
  measurementKind: "area",
  measureUnit: "ft",
  printerMaxWidthFeet: 7,
  optionGroups: [],
};

let mockItemId = "sci_tarp";

jest.mock("expo-router", () => ({
  useFocusEffect: (effect: () => void) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useEffect } = require("react");
    useEffect(effect, [effect]);
  },
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({ itemId: mockItemId }),
}));

describe("a tarpaulin listing's printer width", () => {
  it("says nothing about width when the shop has not published one", async () => {
    mockItemId = "sci_tarp_open";
    rememberListing({ ...TARP, id: "sci_tarp_open", printerMaxWidthFeet: null });
    await renderInSafeArea(<ListingScreen />);
    await screen.findByText("Add to my order");

    expect(screen.queryByText(/Prints up to/)).toBeNull();
    expect(screen.queryByText(/The first number is the width/)).toBeNull();
    expect(screen.queryByText("Too wide for this printer")).toBeNull();
  });

  it("states the cap before anything is typed", async () => {
    mockItemId = "sci_tarp";
    rememberListing(TARP);
    await renderInSafeArea(<ListingScreen />);
    await screen.findByText("Add to my order");

    expect(screen.getByText("Prints up to 7 ft wide")).toBeTruthy();
    expect(screen.getByText("The first number is the width — up to 7 ft on this printer.")).toBeTruthy();
    expect(screen.queryByText("Too wide for this printer")).toBeNull();
  });

  // Interacts, so it goes last in this file (see AGENTS.md on RNTL + React 19).
  it("warns as soon as the typed width is wider than the printer", async () => {
    mockItemId = "sci_tarp";
    rememberListing(TARP);
    await renderInSafeArea(<ListingScreen />);
    await screen.findByText("Add to my order");

    fireEvent.changeText(screen.getByLabelText("How wide it is"), "8");

    expect(await screen.findByText("Too wide for this printer")).toBeTruthy();
    expect(
      screen.getByText("This printer prints up to 7 ft wide, and yours is 8 ft wide. Make it 7 ft wide or less."),
    ).toBeTruthy();
  });
});
