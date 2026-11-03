import type { QuoteRequest } from "@/lib/api";

/** A client-projection quote request for tests (gridgo-api `docs/QUOTE_REQUESTS_API.md`). */
export function quoteRequest(overrides: Partial<QuoteRequest> = {}): QuoteRequest {
  return {
    id: "qreq_1",
    status: "requested",
    version: 1,
    productType: "business_store_signages",
    productTypeName: "Business & store signages",
    use: "Shop front sign",
    placement: "outdoor",
    size: "2 x 6 ft",
    quantity: 2,
    notes: "",
    budgetMinor: null,
    eventDate: null,
    referenceFiles: [{ fileId: "file_1", originalFilename: "sign.pdf" }],
    requestFulfillment: { fulfillmentMode: "delivery", dropoff: { lat: 7.07, lng: 125.61, label: "Event hall" } },
    options: [],
    matchReason: null,
    publishedAt: null,
    validUntil: null,
    acceptedOption: null,
    acceptedAt: null,
    cartId: null,
    orderId: null,
    cancelledAt: null,
    cancelledBy: null,
    cancelReason: null,
    expiredAt: null,
    createdAt: "2026-11-01T02:00:00.000Z",
    updatedAt: "2026-11-01T02:00:00.000Z",
    ...overrides,
  };
}

/** A published request with two options, A ranked first. */
export function publishedQuote(overrides: Partial<QuoteRequest> = {}): QuoteRequest {
  return quoteRequest({
    status: "published",
    version: 4,
    eventDate: "2099-11-20",
    publishedAt: "2026-11-02T02:00:00.000Z",
    validUntil: "2099-11-09T02:00:00.000Z",
    matchReason: { key: "cost", label: "Matched for cost" },
    options: [
      {
        label: "A",
        rank: 1,
        clientPriceMinor: 345000,
        productionTime: { mode: "days", minDays: 3, maxDays: 3 },
        readyBy: "2099-11-06T09:00:00.000Z",
        eventDateFit: "before",
        recommendedOptions: "Use tarpaulin with grommets",
        distanceZone: { key: "nearby", label: "Nearby" },
        acceptable: true,
      },
      {
        label: "B",
        rank: 2,
        clientPriceMinor: 412000,
        productionTime: { mode: "days", minDays: 5, maxDays: 5 },
        readyBy: "2099-11-24T09:00:00.000Z",
        eventDateFit: "after",
        acceptable: true,
      },
    ],
    ...overrides,
  });
}
