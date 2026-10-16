import { render, screen } from "@testing-library/react-native";

import { ColourPricingSection } from "@/components/ColourPricingSection";
import type { CartLineRecord, ColourPage, ColourPricing } from "@/lib/api";

const WARNING =
  "Your file has colour, but this service prints in one colour. Choose a colour service if you need the colours.";

function page(overrides: Partial<ColourPage>): ColourPage {
  return { fileId: "file_pdf", page: 1, strongColourBps: 0, tier: "none", sheetPriceMinor: 4350, clientSheetPriceMinor: 4350, status: "priced", ...overrides };
}

const PRICED: ColourPricing = {
  version: 1,
  status: "priced",
  pricedByColour: true,
  quantityMode: "document_sets",
  quantity: 3,
  totalSheets: 6,
  tierSet: "large_format",
  clientLineSubtotalMinor: 39150,
  warning: null,
  pages: [page({}), page({ page: 2, strongColourBps: 1800, tier: "up_to_25", sheetPriceMinor: 8700, clientSheetPriceMinor: 8700 })],
};

function line(colourPricing: ColourPricing | null, overrides: Partial<CartLineRecord> = {}): CartLineRecord {
  return {
    id: "cline_1",
    catalogItemId: "sci_plans",
    quantity: colourPricing?.quantity ?? 1,
    quantityMode: colourPricing?.quantityMode ?? null,
    optionIds: [],
    measurement: null,
    structuredSpec: {},
    artworkFileId: "file_pdf",
    mockupFileId: null,
    dropoff: null,
    sortOrder: 0,
    listing: { pricedByColour: colourPricing?.pricedByColour ?? true, oneColour: colourPricing ? !colourPricing.pricedByColour : false } as CartLineRecord["listing"],
    lineSubtotalMinor: null,
    clientLineSubtotalMinor: colourPricing?.clientLineSubtotalMinor ?? null,
    colourPricing,
    ...overrides,
  } as CartLineRecord;
}

const noop = () => undefined;
const draw = (value: CartLineRecord) =>
  render(
    <ColourPricingSection line={value} saving={false} onQuantityMode={noop} onQuantity={noop} onRetry={noop} retrying={false} />,
  );

it("lists every page with its strong colour and all-in sheet price, then the total", async () => {
  await draw(line(PRICED));
  expect(screen.getByText("Colour and price")).toBeTruthy();
  expect(screen.getByLabelText("Page 1: 0% strong colour, ₱43.50. No strong colour")).toBeTruthy();
  expect(screen.getByLabelText("Page 2: 18% strong colour, ₱87.00. Up to 25% colour")).toBeTruthy();
  expect(screen.getByText("3 sets × 2 pages = 6 sheets")).toBeTruthy();
  expect(screen.getByLabelText("Printing total: ₱391.50")).toBeTruthy();
  expect(screen.getByLabelText(/Sets of the whole document/).props.accessibilityState).toMatchObject({ selected: true });
});

it("says a page with no shop rate needs a price check, and keeps the total empty", async () => {
  await draw(
    line({
      ...PRICED,
      status: "needs_price_check",
      quantityMode: "copies_each_page",
      quantity: 2,
      clientLineSubtotalMinor: null,
      pages: [
        page({ sheetPriceMinor: null, clientSheetPriceMinor: null }),
        page({ page: 4, strongColourBps: 8013, tier: "above_50", sheetPriceMinor: null, clientSheetPriceMinor: null, status: "needs_price_check", message: "This page needs a price check" }),
      ],
    }),
  );
  expect(screen.getByLabelText("Page 4: 80.2% strong colour. This page needs a price check. Over 50% colour")).toBeTruthy();
  expect(screen.getByText("Some pages need a price check")).toBeTruthy();
  expect(screen.getByText("Page 4 needs a price check.")).toBeTruthy();
  expect(screen.getByLabelText("Printing total: not yet")).toBeTruthy();
  expect(screen.queryByText(/₱/)).toBeNull();
});

it("shows the pages waiting while GRIDGO measures them", async () => {
  await draw(line({ ...PRICED, status: "pending", pages: [], clientLineSubtotalMinor: null }));
  expect(screen.getByText("Measuring the colour on each page")).toBeTruthy();
  expect(screen.getByLabelText("Measuring each page")).toBeTruthy();
});

it("asks copies or sets before pricing, with nothing preselected", async () => {
  await draw(line({ ...PRICED, status: "quantity_mode_required", quantityMode: null, clientLineSubtotalMinor: null }, { quantityMode: null }));
  expect(screen.getByText("Choose copies or sets")).toBeTruthy();
  expect(screen.getByLabelText(/^Copies of each page/).props.accessibilityState).toMatchObject({ selected: false });
  expect(screen.getByLabelText(/^Sets of the whole document/).props.accessibilityState).toMatchObject({ selected: false });
});

it("warns a one-colour service about colour without prices or a block", async () => {
  await draw(
    line({
      ...PRICED,
      status: "fixed_price",
      pricedByColour: false,
      tierSet: undefined,
      warning: WARNING,
      pages: [page({ tier: null, status: undefined }), page({ page: 2, strongColourBps: 1800, tier: null, status: undefined })],
    }),
  );
  expect(screen.getByText("Colour check")).toBeTruthy();
  expect(screen.getByText(WARNING)).toBeTruthy();
  expect(screen.getByLabelText("Page 2: 18% strong colour")).toBeTruthy();
  // Copies or sets still collate a one-colour job; the estimate note is about colour prices only.
  expect(screen.getByText("How should the copies be counted?")).toBeTruthy();
  expect(screen.queryByText(/approve the new price/)).toBeNull();
  expect(screen.queryByText(/₱/)).toBeNull();
});
