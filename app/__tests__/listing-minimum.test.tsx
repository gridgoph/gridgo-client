import { act, fireEvent, render, screen } from "@testing-library/react-native";
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
  PrintZone's lanyard: PHP 50.00 each, and the shop does not run fewer than
  ten. The sheet used to open at 1 with a muted note underneath, let the line
  into the basket, and the basket then showed it at "—" and PHP 0.00 because
  GRIDGO's pricer refuses a quantity under the minimum.
*/
const LANYARD: CatalogItem = {
  ...ITEM,
  id: "sci_lanyard",
  name: "Lanyard/Sling Print",
  basePriceMinor: 5000,
  fromPriceMinor: 5000,
  pricingUnit: "per_unit",
  packageQty: null,
  minimumOrderQuantity: 10,
  optionGroups: [],
};

jest.mock("expo-router", () => ({
  useFocusEffect: (effect: () => void) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useEffect } = require("react");
    useEffect(effect, [effect]);
  },
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({ itemId: "sci_lanyard" }),
}));

describe("a listing with a minimum run", () => {
  it("opens at the shop's minimum and will not step under it", async () => {
    rememberListing(LANYARD);
    await renderInSafeArea(<ListingScreen />);
    await screen.findByText("Add to my order");

    expect(screen.getByText("10")).toBeTruthy();
    expect(screen.getByLabelText("One fewer").props.accessibilityState.disabled).toBe(true);
    expect(screen.getByText("This shop takes orders of 10 and up.")).toBeTruthy();
    // Ten at GRIDGO's PHP 55.00.
    expect(screen.getByText("₱550.00")).toBeTruthy();
    expect(screen.getAllByText("10 pieces").length).toBeGreaterThan(0);
  });
});
