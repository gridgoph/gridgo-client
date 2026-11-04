import { fireEvent, render, screen } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import ListingScreen from "@/app/request/listing";
import type { CatalogItem, CatalogOptionGroup } from "@/lib/api";
import { listingProblemScrollY } from "@/lib/listingValidation";
import { clearListingCache, rememberListing } from "@/lib/listingCache";
import { useCart } from "@/store/cart";
import { useListingDraft } from "@/store/listingDraft";
import { usePlatformSettings } from "@/store/platformSettings";

jest.mock("@/hooks/useLiveRefresh", () => ({
  useLiveRefresh: () => undefined,
}));

jest.mock("expo-router", () => ({
  useFocusEffect: (effect: () => void) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useEffect } = require("react");
    useEffect(effect, [effect]);
  },
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({ itemId: "sci_flyers" }),
}));

jest.mock("react-native-keyboard-controller", () => {
  const React = require("react") as typeof import("react");
  const { ScrollView } = require("react-native") as typeof import("react-native");
  const scrollTo = jest.fn();
  const KeyboardAwareScrollView = React.forwardRef((props: object, ref: React.Ref<unknown>) => {
    React.useImperativeHandle(ref, () => ({ scrollTo }));
    return React.createElement(ScrollView, props);
  });
  KeyboardAwareScrollView.displayName = "KeyboardAwareScrollView";
  return { KeyboardAwareScrollView, scrollTo };
});

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
// eslint-disable-next-line @typescript-eslint/no-require-imports
const keyboard = require("react-native-keyboard-controller") as { scrollTo: jest.Mock };

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
  optionGroups: [SIZE],
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
  keyboard.scrollTo.mockClear();
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

it("scrolls to the first missing field on Add", async () => {
  rememberListing(ITEM);
  await renderInSafeArea(<ListingScreen />);
  await screen.findByText("Add to my order");

  fireEvent(screen.getByTestId("listing-page"), "layout", {
    nativeEvent: { layout: { x: 0, y: 220, width: 390, height: 900 } },
  });
  fireEvent(screen.getByTestId("listing-field-group:g_size"), "layout", {
    nativeEvent: { layout: { x: 0, y: 48, width: 390, height: 160 } },
  });

  await fireEvent.press(screen.getByLabelText("Add to my order"));

  expect(keyboard.scrollTo).toHaveBeenCalledWith({
    y: listingProblemScrollY(220 + 48),
    animated: true,
  });
});
