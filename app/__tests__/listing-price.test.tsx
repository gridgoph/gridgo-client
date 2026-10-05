import { render, screen, waitFor, within } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import ListingScreen from "@/app/request/listing";
import type { CatalogItem, CatalogOptionGroup } from "@/lib/api";
import { clearListingCache, rememberListing } from "@/lib/listingCache";
import { useCart } from "@/store/cart";
import { useListingQuote } from "@/store/listingQuote";
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

function quote(clientLineSubtotalMinor: number) {
  return {
    catalogItemId: "sci_flyers", version: 1, serviceVersion: 1, quantity: 1,
    clientUnitRateMinor: clientLineSubtotalMinor, clientLineSubtotalMinor,
    billableMilliUnits: 1000, minimumMeasurementApplied: false,
  };
}

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
  api.catalogQuote.mockReset();
  api.catalogQuote.mockResolvedValue(quote(2420));
  useListingQuote.getState().reset();
  usePlatformSettings.getState().reset();
  usePlatformSettings.getState().adopt({
    issueWindowHours: 24,
    serviceFeeRateBps: 1000,
    deliveryFeeBands: [{ maxDistanceMeters: null, feeMinor: 2500 }],
  });
});

/*
  The reported leak: the sheet drew the shop's own PHP 22.00 — the figure the
  shop is paid — with "GRIDGO's charge ... added at checkout" under the
  button. A client buys from GRIDGO, so the sheet's price is GRIDGO's, and the
  footer no longer promises a charge that is already inside the number.
*/
describe("the sheet's price is GRIDGO's", () => {
  it("draws the unit price and the running total at GRIDGO's price", async () => {
    rememberListing(ITEM);
    await renderInSafeArea(<ListingScreen />);
    await screen.findByText("Add to my order");

    // PHP 22.00 + 10% = PHP 24.20, per pack; one pack in the bar. The paper
    // is not picked yet, so GRIDGO has nothing it could quote: the bar shows
    // the listing's own estimate, as it always has, and asks for no quote.
    await waitFor(() =>
      expect(within(screen.getByTestId("listing-printing")).getByText("₱24.20")).toBeTruthy(),
    );
    expect(screen.getAllByText("₱24.20")).toHaveLength(2);
    expect(api.catalogQuote).not.toHaveBeenCalled();
    expect(screen.queryByText(/₱22\.00/)).toBeNull();
    expect(screen.getByText("Delivery is added at checkout.")).toBeTruthy();
    expect(screen.queryByText(/GRIDGO’s charge/)).toBeNull();
  });

  it("draws no price at all while GRIDGO's rate is unread and the quote is out", async () => {
    usePlatformSettings.getState().reset();
    api.catalogQuote.mockReturnValue(new Promise(() => {}));
    rememberListing(ITEM);
    await renderInSafeArea(<ListingScreen />);
    await screen.findByText("Add to my order");

    expect(screen.queryByText(/₱/)).toBeNull();
  });
});

/*
  gridgo-api#132: the listing carries GRIDGO's own figures and the line is
  quoted by GRIDGO. Neither is marked up again on the phone.
*/
describe("the sheet reads GRIDGO's own figures", () => {
  const CLIENT_ITEM: CatalogItem = {
    ...ITEM,
    clientBasePriceMinor: 2420,
    clientFromPriceMinor: 2420,
    optionGroups: ITEM.optionGroups.map((group) => ({
      ...group,
      options: group.options.map((option) => ({ ...option, clientPriceModifierMinor: 0 })),
    })),
  };

  it("draws the header from the client figures before the rate is read", async () => {
    usePlatformSettings.getState().reset();
    api.catalogQuote.mockResolvedValue(quote(2420));
    rememberListing(CLIENT_ITEM);
    await renderInSafeArea(<ListingScreen />);

    // Header and quoted bar, with no rate on the phone at all.
    await waitFor(() =>
      expect(within(screen.getByTestId("listing-printing")).getByText("₱24.20")).toBeTruthy(),
    );
    expect(screen.getAllByText("₱24.20")).toHaveLength(2);
    expect(screen.queryByText("₱26.62")).toBeNull();
  });

  // Nothing left to answer, so the sheet is quotable the moment it opens.
  const READY_ITEM: CatalogItem = {
    ...CLIENT_ITEM,
    optionGroups: CLIENT_ITEM.optionGroups.map((group) => ({ ...group, required: false })),
  };

  it("draws GRIDGO's quote for a finished selection, as sent", async () => {
    api.catalogQuote.mockResolvedValue(quote(2662));
    rememberListing(READY_ITEM);
    await renderInSafeArea(<ListingScreen />);
    await screen.findByText("Add to my order");

    await waitFor(() =>
      expect(within(screen.getByTestId("listing-printing")).getByText("₱26.62")).toBeTruthy(),
    );
    expect(api.catalogQuote).toHaveBeenCalledWith(
      expect.objectContaining({ catalogItemId: "sci_flyers", quantity: 1, optionIds: [] }),
    );
  });

  it("draws no figure when GRIDGO refuses to price the line", async () => {
    api.catalogQuote.mockRejectedValue(
      new api.ApiError(409, { error: "printer_cap_exceeded" }),
    );
    rememberListing(READY_ITEM);
    await renderInSafeArea(<ListingScreen />);
    await screen.findByText("Add to my order");

    await waitFor(() =>
      expect(within(screen.getByTestId("listing-printing")).getByText("—")).toBeTruthy(),
    );
    expect(within(screen.getByTestId("listing-printing")).queryByText(/₱/)).toBeNull();
  });

  it("works the line out itself only on an API without the quote route", async () => {
    api.catalogQuote.mockRejectedValue(new api.ApiError(404, { error: "not_found" }));
    rememberListing(ITEM);
    await renderInSafeArea(<ListingScreen />);

    await waitFor(() =>
      expect(within(screen.getByTestId("listing-printing")).getByText("₱24.20")).toBeTruthy(),
    );
  });
});
