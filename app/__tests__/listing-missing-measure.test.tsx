import { fireEvent, render, screen } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import ListingScreen from "@/app/request/listing";
import type { CatalogItem } from "@/lib/api";
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
  useLocalSearchParams: () => ({ itemId: "sci_tarp" }),
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

const TARP: CatalogItem = {
  id: "sci_tarp",
  supplierId: "user_shop",
  supplierServiceId: "svc",
  categoryCode: "marketing_collateral",
  subcategoryCode: "tarpaulins_outdoor_banners",
  name: "Tarpaulin",
  description: null,
  basePriceMinor: 1800,
  fromPriceMinor: 1800,
  effectivePriceMinor: null,
  pricingUnit: "per_area",
  packageQty: null,
  measurementKind: "area",
  measureUnit: "ft",
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

it("asks for the missing size numbers on the fields themselves", async () => {
  rememberListing(TARP);
  await renderInSafeArea(<ListingScreen />);
  await screen.findByText("Add to my order");

  await fireEvent.press(screen.getByLabelText("Add to my order"));

  expect(screen.getByText("Enter how wide it is.")).toBeTruthy();
  expect(screen.getByText("Enter how tall it is.")).toBeTruthy();
});
