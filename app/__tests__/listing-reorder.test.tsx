import { act, renderHook, screen } from "@testing-library/react-native";

import { useStartPrintJob } from "@/hooks/useStartPrintJob";
import { clearListingCache, rememberListing } from "@/lib/listingCache";
import { REORDER_SHEET_NOTE } from "@/lib/reorder";
import { useCart } from "@/store/cart";
import { useListingDraft } from "@/store/listingDraft";
import { usePlatformSettings } from "@/store/platformSettings";
import { useReorderJob } from "@/store/reorderJob";
import { renderSheet, reorderFlyers as flyers, startReorderJob as startJob } from "@/test/reorderListing";

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
  recordFunnel: jest.fn(async () => undefined),
}));

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
  startJob({ lineId: "cline_1" });
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

/* What a step away keeps, and what it must not hand to the next job. */
describe("the draft a carried sheet leaves behind", () => {
  async function leaveCarriedSheet() {
    rememberListing(flyers());
    startJob();
    const sheet = await renderSheet();
    expect(isChosen(/^Gloss/)).toBe(true);
    await sheet.unmount();
  }

  it("does not reach an ordinary new print of the same listing", async () => {
    await leaveCarriedSheet();
    const { result } = await renderHook(() => useStartPrintJob());
    await act(async () => result.current("marketing_collateral", "flyers"));

    await renderSheet();

    expect(isChosen(/^Gloss/)).toBe(false);
    expect(screen.queryByText(REORDER_SHEET_NOTE)).toBeNull();
    expect(useListingDraft.getState().drafts["item:sci_flyers"].selection).toEqual({});
    expect(useListingDraft.getState().drafts["item:sci_flyers"].reorderJobId).toBeNull();
  });

  it("does not reach another repeated job's sheet", async () => {
    await leaveCarriedSheet();
    const nextJob = startJob({ quantity: 5 });

    await renderSheet();

    expect(screen.getByText("5")).toBeTruthy();
    expect(useListingDraft.getState().drafts["item:sci_flyers"].reorderJobId).toBe(nextJob);
  });

  it("comes back to the same unfinished sheet, the client's changes and the note with it", async () => {
    await leaveCarriedSheet();
    const key = "item:sci_flyers";
    useListingDraft.getState().keep(key, {
      ...useListingDraft.getState().drafts[key],
      selection: { grp_paper: "opt_matte" },
      quantity: 9,
    });

    await renderSheet();

    expect(isChosen(/^Matte/)).toBe(true);
    expect(screen.getByText("9")).toBeTruthy();
    expect(screen.getByText(REORDER_SHEET_NOTE)).toBeTruthy();
  });

  it("leaves an ordinary unfinished sheet to come back as it always did", async () => {
    rememberListing(flyers());
    useListingDraft.getState().keep("item:sci_flyers", {
      selection: { grp_paper: "opt_matte" },
      quantity: 4,
      measured: { width: "", height: "", length: "", pages: "" },
      note: "",
      layout: null,
    });

    await renderSheet();

    expect(isChosen(/^Matte/)).toBe(true);
    expect(screen.getByText("4")).toBeTruthy();
    expect(screen.queryByText(REORDER_SHEET_NOTE)).toBeNull();
  });
});
