import { act, fireEvent, render, screen } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import ListingScreen from "@/app/request/listing";
import type { CatalogItem, CatalogOptionGroup } from "@/lib/api";
import { clearListingCache, rememberListing } from "@/lib/listingCache";
import { useCart } from "@/store/cart";

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
});

describe("ListingScreen", () => {
  it("opens the listing immediately when the match already gave it", async () => {
    rememberListing(ITEM);
    api.getCatalogItem.mockReturnValue(new Promise(() => {}));
    await renderInSafeArea(<ListingScreen />);

    expect(screen.getByText("Flyers")).toBeTruthy();
    // The eyebrow is the storefront the sheet belongs to, never the press.
    expect(screen.getByText("GRIDGO")).toBeTruthy();
    expect(screen.queryByText(/Quickprint/i)).toBeNull();
    expect(screen.getByText("Add to my order")).toBeTruthy();
    expect(screen.queryByLabelText("Opening the listing")).toBeNull();
    expect(api.getCatalogItem).not.toHaveBeenCalled();
  });

  it("does not refetch the listing when an option is ticked", async () => {
    rememberListing(ITEM);
    api.getCatalogItem.mockResolvedValue(ITEM);
    await renderInSafeArea(<ListingScreen />);
    await screen.findByText("Add to my order");

    fireEvent.press(screen.getByLabelText("Gloss, Paper"));

    expect(api.getCatalogItem).not.toHaveBeenCalled();
    expect(screen.getByText("Flyers")).toBeTruthy();
  });

  it("keeps the sheet up if a later refresh fails", async () => {
    rememberListing(ITEM);
    api.getCatalogItem.mockRejectedValue(new Error("offline"));
    await renderInSafeArea(<ListingScreen />);

    expect(screen.getByText("Flyers")).toBeTruthy();
    expect(screen.queryByLabelText("Opening the listing")).toBeNull();
    expect(screen.queryByText("This listing did not open")).toBeNull();
  });

  it("shows the opening skeleton only when nothing is remembered yet", async () => {
    api.getCatalogItem.mockReturnValue(new Promise(() => {}));
    await renderInSafeArea(<ListingScreen />);

    expect(await screen.findByLabelText("Opening the listing")).toBeTruthy();
    expect(screen.queryByText("Add to my order")).toBeNull();
  });
});

let mockRefresh: () => Promise<void>;
jest.mock("@/hooks/useLiveRefresh", () => ({
  useLiveRefresh: (_resources: unknown, refresh: () => Promise<void>) => { mockRefresh = refresh; },
}));

it("keeps the refreshed listing when the initial request finishes late", async () => {
  useCart.setState({ cartId: "cart_1" });
  let finish!: (item: CatalogItem) => void;
  api.getCatalogItem.mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));
  api.getCatalogItem.mockResolvedValue({ ...ITEM, name: "New listing", fromPriceMinor: 9900 });
  await renderInSafeArea(<ListingScreen />);
  clearListingCache();
  await act(async () => { await mockRefresh(); });
  expect(screen.getByText("New listing")).toBeTruthy();
  await act(async () => { finish({ ...ITEM, name: "Old listing" }); });
  expect(screen.getByText("New listing")).toBeTruthy();
  expect(screen.queryByText("Old listing")).toBeNull();
});
