import type { Issue, Order } from "@/lib/api";
import {
  closedAt,
  handoverAt,
  isJobComplete,
  issueOutcome,
  summarizeJobComplete,
} from "@/lib/jobComplete";

const order: Order = {
  id: "ord_done_1",
  clientId: "user_client",
  supplierId: "user_supplier",
  riderId: "user_rider",
  state: "completed",
  productId: "prod_tarpaulin",
  title: "Grand opening tarpaulin",
  quantity: 2,
  size: "3x6 ft",
  material: "13oz tarpaulin",
  deadline: "2026-08-15T10:00:00+08:00",
  address: "12 J.P. Laurel Ave, Bajada, Davao City",
  zone: "davao_central",
  subtotalMinor: 110000,
  deliveryFeeMinor: 2500,
  totalMinor: 112500,
  downpaymentMinor: 84375,
  balanceMinor: 28125,
  paymentMethod: "qr_manual",
  paymentStatus: "paid",
  promisedDate: null,
  artworkName: "opening-banner.pdf",
  createdAt: "2026-08-08T10:00:00+08:00",
  updatedAt: "2026-08-12T10:00:00+08:00",
  timeline: [
    { at: "2026-08-08T10:00:00+08:00", state: "submitted", by: "user_client", note: "" },
    { at: "2026-08-11T16:12:00+08:00", state: "delivered", by: "user_rider", note: "" },
    { at: "2026-08-11T16:12:00+08:00", state: "issue_window_open", by: "system", note: "" },
    {
      at: "2026-08-12T16:12:00+08:00",
      state: "completed",
      by: "system",
      note: "Issue window expired with no active claim",
    },
  ],
};

function issue(status: string): Issue {
  return {
    id: "iss_1",
    orderId: order.id,
    clientId: order.clientId,
    description: "Colour is washed out across all 200 flyers",
    kind: "material_quality",
    status,
    createdAt: "2026-08-11T18:00:00+08:00",
    updatedAt: "2026-08-12T09:00:00+08:00",
    resolvedAt: status === "resolved" ? "2026-08-12T09:00:00+08:00" : null,
    resolution: status === "resolved" ? "Reprinted" : null,
  };
}

describe("isJobComplete", () => {
  it("is true only for the two closed states", () => {
    expect(isJobComplete("completed")).toBe(true);
    expect(isJobComplete("payout_released")).toBe(true);
    expect(isJobComplete("issue_window_open")).toBe(false);
    expect(isJobComplete("delivered")).toBe(false);
    expect(isJobComplete(null)).toBe(false);
  });
});

describe("issueOutcome", () => {
  it("only an empty read earns 'none'", () => {
    expect(issueOutcome([])).toBe("none");
    expect(issueOutcome(null)).toBe("unknown");
    expect(issueOutcome(undefined)).toBe("unknown");
    expect(issueOutcome([issue("resolved")])).toBe("resolved");
    expect(issueOutcome([issue("resolved"), issue("open")])).toBe("open");
  });
});

describe("summarizeJobComplete", () => {
  it("says the job went through with nothing reported, and that nothing more is needed", () => {
    const view = summarizeJobComplete(order, []);

    expect(view.headline).toBe("Job complete");
    expect(view.body).toMatch(/delivered/);
    expect(view.body).toMatch(/nothing reported/);
    expect(view.body).toMatch(/settled in full/);
    expect(view.body).toMatch(/nothing more is needed from you/);
    expect(view.facts).toEqual([
      { label: "Delivered", value: expect.stringMatching(/Aug/) },
      { label: "Check window", value: "Closed, nothing reported" },
      { label: "Payment", value: "Paid in full, ₱1,125.00" },
    ]);
  });

  it("never claims nothing was reported when the issue list could not be read", () => {
    const view = summarizeJobComplete(order, null);

    expect(view.body).not.toMatch(/nothing reported/);
    expect(view.body).toMatch(/check window has closed/);
    expect(view.facts).toContainEqual({ label: "Check window", value: "Closed" });
  });

  it("tells a client who reported a problem that it was settled", () => {
    const view = summarizeJobComplete(order, [issue("resolved")]);

    expect(view.body).toMatch(/problem you reported was settled/);
    expect(view.body).not.toMatch(/nothing reported/);
    expect(view.facts).toContainEqual({ label: "Check window", value: "Closed, report settled" });
  });

  it("keeps an unresolved report honest rather than calling the job clean", () => {
    const view = summarizeJobComplete(order, [issue("open")]);

    expect(view.body).toMatch(/still with Operations/);
    expect(view.facts).toContainEqual({ label: "Check window", value: "Report under review" });
  });

  it("speaks of collecting, not delivery, for a job fetched from the counter", () => {
    const view = summarizeJobComplete({ ...order, fulfillmentMode: "pickup" }, []);

    expect(view.body).toMatch(/collected at GRIDGO Office/);
    expect(view.body).not.toMatch(/delivered/);
    expect(view.facts[0]).toEqual({ label: "Collected", value: expect.any(String) });
  });

  it("does not say the payment is settled unless the record says paid", () => {
    const view = summarizeJobComplete({ ...order, paymentStatus: "downpayment_confirmed" }, []);

    expect(view.body).not.toMatch(/settled in full/);
    expect(view.facts).toContainEqual({ label: "Payment", value: "Downpayment confirmed" });
  });

  it("thanks a client who has already rated", () => {
    const view = summarizeJobComplete({ ...order, rated: true }, []);

    expect(view.facts).toContainEqual({ label: "Your rating", value: "Sent, thank you" });
  });
});

describe("handoverAt / closedAt", () => {
  it("reads the handover from the timeline, falling back to when the window opened", () => {
    expect(handoverAt(order)).toBe("2026-08-11T16:12:00+08:00");
    expect(
      handoverAt({ timeline: [], issueWindowOpenedAt: "2026-08-11T17:00:00+08:00" }),
    ).toBe("2026-08-11T17:00:00+08:00");
    expect(handoverAt({ timeline: [], issueWindowOpenedAt: null })).toBeNull();
  });

  it("reads when the platform closed the job", () => {
    expect(closedAt(order)).toBe("2026-08-12T16:12:00+08:00");
    expect(closedAt({ timeline: [] })).toBeNull();
  });
});
