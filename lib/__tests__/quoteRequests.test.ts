import { ApiError, type QuoteRequest } from "@/lib/api";
import { pushTargetRoute } from "@/lib/push";
import {
  EMPTY_QUOTE_BRIEF,
  canAcceptQuote,
  canCancelQuote,
  checkQuoteBrief,
  expiredQuoteFrom,
  newQuoteHref,
  pesosToMinor,
  productionTimeLine,
  quoteErrorMessage,
  quoteNotificationRoute,
  quoteOptionsView,
  quoteStatusOf,
  quoteStatusView,
  validityLine,
} from "@/lib/quoteRequests";
import { quoteRequest } from "@/test/quoteRequest";

const NOW = Date.parse("2026-11-02T04:00:00.000Z");
const TODAY = "2026-11-02";

describe("checkQuoteBrief", () => {
  const complete = {
    ...EMPTY_QUOTE_BRIEF,
    productType: "business_store_signages",
    referenceFileId: "file_1",
    use: "Shop front sign",
    placement: "outdoor" as const,
    size: "2 x 6 ft",
    quantity: "2",
  };

  it("names every missing required field and sends nothing", () => {
    const { errors, brief } = checkQuoteBrief({ ...EMPTY_QUOTE_BRIEF, quantity: "" }, TODAY);
    expect(brief).toBeNull();
    expect(Object.keys(errors).sort()).toEqual(
      ["placement", "productType", "quantity", "referenceFileId", "size", "use"].sort(),
    );
  });

  it("builds the request body with only the optional fields given", () => {
    const { errors, brief } = checkQuoteBrief(complete, TODAY);
    expect(errors).toEqual({});
    expect(brief).toEqual({
      productType: "business_store_signages",
      referenceFileIds: ["file_1"],
      use: "Shop front sign",
      placement: "outdoor",
      size: "2 x 6 ft",
      quantity: 2,
    });
  });

  it("reads a budget in pesos and an event date, and has no deadline", () => {
    const { brief } = checkQuoteBrief(
      { ...complete, notes: " Weatherproof ", budget: "₱5,000", eventDate: "2026-11-20" },
      TODAY,
    );
    expect(brief).toMatchObject({ notes: "Weatherproof", budgetMinor: 500000, eventDate: "2026-11-20" });
    expect(brief).not.toHaveProperty("deadline");
  });

  it("refuses a past event date, a bad date, a bad budget and an out-of-range quantity", () => {
    expect(checkQuoteBrief({ ...complete, eventDate: "2026-11-01" }, TODAY).errors.eventDate).toBe("That date has passed.");
    expect(checkQuoteBrief({ ...complete, eventDate: "2026-02-30" }, TODAY).errors.eventDate).toMatch(/YYYY-MM-DD/);
    expect(checkQuoteBrief({ ...complete, budget: "five" }, TODAY).errors.budget).toMatch(/pesos/);
    expect(checkQuoteBrief({ ...complete, quantity: "0" }, TODAY).errors.quantity).toMatch(/1 to 100,000/);
    expect(checkQuoteBrief({ ...complete, quantity: "100001" }, TODAY).errors.quantity).toBeDefined();
    expect(checkQuoteBrief({ ...complete, notes: "x".repeat(301) }, TODAY).errors.notes).toBeDefined();
  });

  it("only quotes signage and 3D printing", () => {
    expect(checkQuoteBrief({ ...complete, productType: "flyers" }, TODAY).errors.productType).toBeDefined();
    expect(newQuoteHref("flyers")).toBe("/quotes/new");
    expect(newQuoteHref("three_d_printing_scale_models")).toBe("/quotes/new?productType=three_d_printing_scale_models");
  });
});

describe("pesosToMinor", () => {
  it("reads what a client types", () => {
    expect(pesosToMinor("5000")).toBe(500000);
    expect(pesosToMinor("5,000.50")).toBe(500050);
    expect(pesosToMinor("abc")).toBeNull();
    expect(pesosToMinor("-1")).toBeNull();
  });
});

describe("statuses", () => {
  it("says each status in plain words", () => {
    const label = (status: string, extra: Partial<QuoteRequest> = {}) =>
      quoteStatusView(quoteRequest({ status, ...extra }), NOW).label;
    expect(label("requested")).toBe("Waiting for options");
    expect(label("quoting")).toBe("Waiting for options");
    expect(label("published")).toBe("Options ready");
    expect(label("accepted")).toBe("Accepted");
    expect(label("ordered")).toBe("Ordered");
    expect(label("expired")).toBe("Expired");
    expect(label("cancelled")).toBe("Cancelled");
    expect(label("something_new")).toBe("Updating");
  });

  it("reads published options past their validity as expired before GRIDGO's sweep", () => {
    const lapsed = quoteRequest({ status: "published", validUntil: "2026-11-02T03:59:59.000Z" });
    expect(quoteStatusOf(lapsed, NOW)).toBe("expired");
    expect(canAcceptQuote(lapsed, NOW)).toBe(false);
    expect(canCancelQuote(lapsed, NOW)).toBe(true);
    expect(validityLine(lapsed, NOW)).toMatch(/^Prices ended /);

    const open = quoteRequest({ status: "published", validUntil: "2026-11-09T04:00:00.000Z" });
    expect(canAcceptQuote(open, NOW)).toBe(true);
    expect(validityLine(open, NOW)).toMatch(/^Prices held until Mon, Nov 9, 2026/);
  });

  it("closes an ordered or cancelled request", () => {
    expect(canCancelQuote(quoteRequest({ status: "ordered" }), NOW)).toBe(false);
    expect(canCancelQuote(quoteRequest({ status: "cancelled" }), NOW)).toBe(false);
  });
});

describe("quoteOptionsView", () => {
  it("draws A, B, C in rank order with one all-in price and no shop", () => {
    const quote = quoteRequest({
      status: "published",
      eventDate: "2026-11-20",
      matchReason: { key: "cost", label: "Matched for cost" },
      options: [
        { label: "B", rank: 2, clientPriceMinor: 412000, eventDateFit: "after", readyBy: "2026-11-24T09:00:00.000Z" },
        {
          label: "A",
          rank: 1,
          clientPriceMinor: 345000,
          productionTime: { mode: "days", minDays: 3, maxDays: 3 },
          readyBy: "2026-11-06T09:00:00.000Z",
          eventDateFit: "before",
          recommendedOptions: "Use tarpaulin with grommets",
          // Never sent to a client; even if it were, it is never read.
          ...({ shopName: "Secret Print Shop", supplierId: "user_shop", priceMinor: 300000 } as object),
        },
      ],
    });
    const views = quoteOptionsView(quote);
    expect(views.map((view) => view.title)).toEqual(["Option A", "Option B"]);
    expect(views[0]).toMatchObject({
      price: "₱3,450.00",
      badge: "MATCHED FOR COST",
      production: "Made in 3 working days",
      recommended: "Use tarpaulin with grommets",
    });
    expect(views[0].fit?.text).toBe("Ready before your date (Nov 20)");
    expect(views[1].fit?.text).toBe("Ready after your date (Nov 20)");
    expect(views[1].badge).toBeNull();
    const drawn = JSON.stringify(views);
    expect(drawn).not.toMatch(/Secret Print Shop|user_shop|3,000\.00|300000/);
  });

  it("shows at most three options and no fit without an event date", () => {
    const options = ["A", "B", "C", "D"].map((label, index) => ({ label, rank: index + 1, clientPriceMinor: 1000 }));
    const views = quoteOptionsView(quoteRequest({ status: "published", options, eventDate: null }));
    expect(views).toHaveLength(3);
    expect(views.every((view) => view.fit === null)).toBe(true);
  });

  it("says production time in working days", () => {
    expect(productionTimeLine({ mode: "days", minDays: 2, maxDays: 4 })).toBe("Made in 2–4 working days");
    expect(productionTimeLine({ mode: "same_day", hours: 6 })).toBe("Made the same day");
    expect(productionTimeLine(null)).toBeNull();
  });
});

describe("refusals and routing", () => {
  it("words an expired accept plainly and hands back the refreshed request", () => {
    const refreshed = quoteRequest({ status: "expired" });
    const error = new ApiError(410, { error: "quote_expired", message: "x", quoteRequest: refreshed });
    expect(quoteErrorMessage(error, "fallback")).toMatch(/^These options have expired/);
    expect(expiredQuoteFrom(error)).toBe(refreshed);
    expect(quoteErrorMessage(new ApiError(409, { error: "quote_line_locked" }), "fallback")).toMatch(/quoted job keeps/);
  });

  it("opens a quote notice on its quote, and a push on My quotes", () => {
    expect(quoteNotificationRoute({ type: "quote_options_ready", quoteRequestId: "qreq_1" })).toBe("/quotes/qreq_1");
    expect(quoteNotificationRoute({ type: "quote_expired" })).toBe("/quotes");
    expect(quoteNotificationRoute({ type: "order_delivered", quoteRequestId: "qreq_1" })).toBeNull();
    expect(
      pushTargetRoute({ notificationId: "ntf_1", type: "quote_validity_changed", orderId: null, at: null }),
    ).toBe("/quotes");
  });
});
