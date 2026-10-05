import * as api from "@/lib/api";
import { QUOTE_DEBOUNCE_MS, useListingQuote } from "@/store/listingQuote";

jest.mock("@/lib/api", () => {
  const actual = jest.requireActual("@/lib/api");
  return { ...actual, catalogQuote: jest.fn() };
});

const catalogQuote = api.catalogQuote as jest.MockedFunction<typeof api.catalogQuote>;

function quote(clientLineSubtotalMinor: number): api.CatalogQuote {
  return {
    catalogItemId: "sci",
    version: 1,
    serviceVersion: 1,
    quantity: 1,
    clientUnitRateMinor: clientLineSubtotalMinor,
    clientLineSubtotalMinor,
    billableMilliUnits: 1000,
    minimumMeasurementApplied: false,
  };
}

const input = (quantity: number): api.CatalogQuoteInput => ({ catalogItemId: "sci", quantity });

beforeEach(() => {
  jest.useFakeTimers();
  catalogQuote.mockReset();
  useListingQuote.getState().reset();
});

afterEach(() => {
  jest.useRealTimers();
});

async function settle() {
  await jest.advanceTimersByTimeAsync(QUOTE_DEBOUNCE_MS);
}

it("asks once for a run of quick changes, for the last one", async () => {
  catalogQuote.mockResolvedValue(quote(3300));
  const { request } = useListingQuote.getState();
  request("q1", input(1));
  request("q2", input(2));
  request("q3", input(3));
  expect(useListingQuote.getState().status).toBe("pending");
  await settle();

  expect(catalogQuote).toHaveBeenCalledTimes(1);
  expect(catalogQuote).toHaveBeenCalledWith(input(3));
  expect(useListingQuote.getState()).toMatchObject({ key: "q3", status: "priced" });
  expect(useListingQuote.getState().quote?.clientLineSubtotalMinor).toBe(3300);
});

it("drops an answer for a configuration the client has moved past", async () => {
  let answerFirst!: (value: api.CatalogQuote) => void;
  catalogQuote.mockReturnValueOnce(new Promise((resolve) => { answerFirst = resolve; }));
  catalogQuote.mockResolvedValueOnce(quote(2200));
  const { request } = useListingQuote.getState();
  request("q1", input(1));
  await settle();
  request("q2", input(2));
  await settle();
  answerFirst(quote(1100));
  await Promise.resolve();

  expect(useListingQuote.getState()).toMatchObject({ key: "q2", status: "priced" });
  expect(useListingQuote.getState().quote?.clientLineSubtotalMinor).toBe(2200);
});

it("settles on no price for a refusal, and for nothing to ask", async () => {
  catalogQuote.mockRejectedValue(new api.ApiError(409, { error: "below_minimum_quantity" }));
  useListingQuote.getState().request("q1", input(1));
  await settle();
  expect(useListingQuote.getState()).toMatchObject({ status: "none", quote: null });

  useListingQuote.getState().request("q2", null);
  expect(useListingQuote.getState()).toMatchObject({ key: "q2", status: "none" });
});

it("stops asking an API without the route, and says so", async () => {
  catalogQuote.mockRejectedValue(new api.ApiError(404, { error: "not_found" }));
  useListingQuote.getState().request("q1", input(1));
  await settle();
  expect(useListingQuote.getState().status).toBe("unsupported");

  useListingQuote.getState().request("q2", input(2));
  await settle();
  expect(catalogQuote).toHaveBeenCalledTimes(1);
  expect(useListingQuote.getState()).toMatchObject({ key: "q2", status: "unsupported" });
});

it("treats a listing taken down as no price, not as an old API", async () => {
  catalogQuote.mockRejectedValue(new api.ApiError(404, { error: "catalog_item_not_found" }));
  useListingQuote.getState().request("q1", input(1));
  await settle();
  expect(useListingQuote.getState().status).toBe("none");
});
