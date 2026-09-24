import { act, cleanup, render, screen, within } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import CheckoutScreen from "@/app/checkout";
import { useCheckoutPayment } from "@/store/checkoutPayment";
import ListingScreen from "@/app/request/listing";
import type { Cart, CartLineRecord, CatalogItem, CatalogOptionGroup } from "@/lib/api";
import { clearListingCache, rememberListing } from "@/lib/listingCache";
import { basketTotals } from "@/lib/basket";
import { CategorySampleCard } from "@/components/CategorySample";
import { usePlatformSettings } from "@/store/platformSettings";
import { useCart } from "@/store/cart";

jest.mock("expo-router", () => ({
  useFocusEffect: (effect: () => void) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useEffect } = require("react");
    useEffect(effect, [effect]);
  },
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({ itemId: "sci_flyers", lineId: "line_price" }),
}));

jest.mock("@/lib/api", () => {
  const actual = jest.requireActual("@/lib/api");
  return {
    ...actual,
    getCatalogItem: jest.fn(),
    getSettings: jest.fn(),
    getCart: jest.fn(),
    getCatalogShop: jest.fn(),
    listAddresses: jest.fn(),
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
  useCheckoutPayment.getState().reset();
  api.getCatalogShop.mockResolvedValue(null);
  api.listAddresses.mockResolvedValue([]);
  usePlatformSettings.getState().reset();
  clearListingCache();
  useCart.getState().reset();
  api.getCatalogItem.mockReset();
  api.getSettings.mockReset();
  api.getSettings.mockResolvedValue({
    serviceFeeRateBps: 4_500,
    issueWindowHours: 24,
    deliveryFeeBands: [],
  });
});


jest.mock("@/hooks/useLiveRefresh", () => ({ useLiveRefresh: jest.fn() }));

function configuredCart(item: CatalogItem, measurement: CartLineRecord["measurement"], quantity: number, subtotal: number): Cart {
  return {
    id: "cart_price", state: "draft", version: 1, serviceLevel: "standard",
    scheduledFor: null, fulfillmentMode: "pickup", defaultDropoff: null,
    checkedOutOrderId: null, createdAt: "", updatedAt: "",
    lines: [{
      id: "line_price", supplierId: item.supplierId, catalogItemId: item.id,
      quantity, optionIds: ["opt_gloss"], measurement, structuredSpec: {},
      artworkFileId: "art", mockupFileId: null, dropoff: null, sortOrder: 0,
      listing: item, lineSubtotalMinor: subtotal,
    }],
  };
}

it.each([
  { name: "one piece", area: false, measurement: null, quantity: 1, subtotal: 1200, total: 1740 },
  { name: "measured tarpaulin", area: true, measurement: { width: 1000, height: 1450 }, quantity: 1, subtotal: 1740, total: 2523 },
  { name: "three pieces with selected finish", area: false, measurement: null, quantity: 3, subtotal: 4500, total: 6525, modifier: 300 },
])("shows the same configured Printing amount as checkout: $name", async ({ area, measurement, quantity, subtotal, total, modifier = 0 }) => {
  const item: CatalogItem = {
    ...ITEM, basePriceMinor: 1200, fromPriceMinor: 1200,
    clientFromPriceMinor: 1740, clientEffectivePriceMinor: 1740,
    pricingUnit: area ? "per_area" : "per_unit", packageQty: null,
    measurementKind: area ? "area" : "none", measureUnit: area ? "ft" : null,
    optionGroups: ITEM.optionGroups.map((group) => ({ ...group, options: group.options.map((option) => ({ ...option, priceModifierMinor: modifier })) })),
  };
  const settings = { serviceFeeRateBps: 4500, issueWindowHours: 24, deliveryFeeBands: [] };
  usePlatformSettings.getState().adopt(settings);
  // A working card charges only once. The same amount must survive opening the sheet.
  await render(
    <CategorySampleCard
      listing={item}
      subcategory={{ code: item.subcategoryCode, name: item.name, examples: "", productFamilyIds: [] }}
      onPress={jest.fn()}
    />,
  );
  expect(screen.getByText("From ₱17.40")).toBeTruthy();
  expect(screen.getByText(area ? "per sq ft" : "each")).toBeTruthy();
  expect(screen.getByLabelText(`${item.name}, from ₱17.40 ${area ? "per sq ft" : "each"}`)).toBeTruthy();
  await cleanup();
  const cart = configuredCart(item, measurement, quantity, subtotal);
  useCart.setState({ cartId: cart.id, cart });
  rememberListing(item);
  await renderInSafeArea(<ListingScreen />);
  // Let the settings refresh settle before comparing the rendered configuration.
  await act(async () => {});
  const printing = basketTotals({ cart, settings, shopPoints: {} }).clientItemSubtotalMinor;
  expect(printing).toBe(total);
  expect(within(screen.getByTestId("listing-printing")).getByText(api.formatPhp(printing))).toBeTruthy();
  if (!modifier) expect(screen.getAllByText("₱17.40").length).toBeGreaterThan(0);
  if (modifier) expect(screen.getByText("+₱4.35 each")).toBeTruthy();
  if (area) expect(screen.getByText("per sq ft")).toBeTruthy();
  await cleanup();
  api.getCart.mockResolvedValue(cart);
  await renderInSafeArea(<CheckoutScreen />);
  await screen.findByText("Service fee · 45%");
  expect(within(screen.getByText("Printing").parent!).getByText(api.formatPhp(total))).toBeTruthy();
});

it("waits for settings without showing a raw or stale configured price", async () => {
  const item = { ...ITEM, clientFromPriceMinor: 3190, clientEffectivePriceMinor: 3190 };
  rememberListing(item);
  useCart.setState({ cartId: "cart_price", cart: configuredCart(item, null, 1, 2200) });
  let finish!: (settings: { serviceFeeRateBps: number; issueWindowHours: number; deliveryFeeBands: [] }) => void;
  api.getSettings.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
  await renderInSafeArea(<ListingScreen />);
  expect(screen.getAllByLabelText("Price loading")).toHaveLength(2);
  expect(screen.queryByText("₱22.00")).toBeNull();
  expect(screen.queryByText("₱31.90")).toBeNull();
  await act(async () => { finish({ serviceFeeRateBps: 4500, issueWindowHours: 24, deliveryFeeBands: [] }); });
  expect(screen.getAllByText("₱31.90")).toHaveLength(2);
  expect(screen.queryByText("₱46.26")).toBeNull();
});
