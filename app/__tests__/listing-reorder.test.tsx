import { render, screen } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import ListingScreen from "@/app/request/listing";
import type { CatalogItem } from "@/lib/api";
import { clearListingCache, rememberListing } from "@/lib/listingCache";
import { REORDER_SHEET_NOTE, reorderAnswers } from "@/lib/reorder";
import { useCart } from "@/store/cart";
import { useListingDraft } from "@/store/listingDraft";
import { usePlatformSettings } from "@/store/platformSettings";
import { useReorderJob } from "@/store/reorderJob";
import { CURRENT_FLOW_ORDER } from "@/test/reorderFixtures";

let mockParams: Record<string, string> = { itemId: "sci_flyers" };

jest.mock("expo-router", () => ({
  useFocusEffect: (effect: () => void) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useEffect } = require("react");
    useEffect(effect, [effect]);
  },
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => mockParams,
}));

jest.mock("@/lib/api", () => ({
  ...jest.requireActual("@/lib/api"),
  getCatalogItem: jest.fn(() => new Promise(() => {})),
  catalogQuote: jest.fn(() => new Promise(() => {})),
  createCart: jest.fn(() => new Promise(() => {})),
}));

function flyers(overrides: Partial<CatalogItem> = {}): CatalogItem {
  return {
    id: "sci_flyers",
    supplierId: "user_shop",
    supplierServiceId: "svc",
    categoryCode: "marketing_collateral",
    subcategoryCode: "flyers",
    name: "Flyers",
    description: "",
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
          { id: "opt_gloss", label: "Gloss", priceModifierMinor: 0, specBinding: null, sortOrder: 0 },
          { id: "opt_matte", label: "Matte", priceModifierMinor: 0, specBinding: null, sortOrder: 1 },
        ],
      },
    ],
    version: 1,
    serviceVersion: 1,
    ...overrides,
  } as CatalogItem;
}

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

function startJob(lineId: string | null = null) {
  useReorderJob.getState().start({
    subcategory: "flyers",
    answers: reorderAnswers(CURRENT_FLOW_ORDER),
    files: null,
    lineId,
    artworkNote: null,
  });
}

/** The option's radio or checkbox, whichever the picker draws, read by its label. */
function isChosen(label: RegExp) {
  return screen.getByLabelText(label).props.accessibilityState?.selected === true
    || screen.getByLabelText(label).props.accessibilityState?.checked === true;
}

beforeEach(() => {
  mockParams = { itemId: "sci_flyers" };
  clearListingCache();
  useCart.getState().reset();
  useListingDraft.getState().clear();
  useReorderJob.getState().clear();
  usePlatformSettings.getState().reset();
  usePlatformSettings.getState().adopt({
    issueWindowHours: 24,
    serviceFeeRateBps: 1000,
    deliveryFeeBands: [{ maxDistanceMeters: null, feeMinor: 2500 }],
  });
});

it("starts a repeated job from the past order's answers, and says so", async () => {
  rememberListing(flyers());
  startJob();

  await renderSheet();

  expect(screen.getByText(REORDER_SHEET_NOTE)).toBeTruthy();
  expect(isChosen(/^Gloss/)).toBe(true);
  expect(isChosen(/^Matte/)).toBe(false);
});

it("starts empty with no job behind it", async () => {
  rememberListing(flyers());

  await renderSheet();

  expect(screen.queryByText(REORDER_SHEET_NOTE)).toBeNull();
  expect(isChosen(/^Gloss/)).toBe(false);
});

it("starts empty for another product, and once the job has its line", async () => {
  rememberListing(flyers({ subcategoryCode: "brochures" }));
  startJob();
  await renderSheet();
  expect(screen.queryByText(REORDER_SHEET_NOTE)).toBeNull();
  expect(isChosen(/^Gloss/)).toBe(false);
});

it("starts empty once the job already has its line", async () => {
  rememberListing(flyers());
  startJob("cline_1");
  await renderSheet();
  expect(screen.queryByText(REORDER_SHEET_NOTE)).toBeNull();
});

it("never pre-answers a sample", async () => {
  mockParams = { itemId: "sci_flyers", sample: "1" };
  rememberListing(flyers());
  startJob();
  await renderSheet();
  expect(screen.queryByText(REORDER_SHEET_NOTE)).toBeNull();
});
