import {
  formatHandoverCode,
  handoverKind,
  isHubHandover,
  redeliveryOffered,
  spokenHandoverCode,
  unclaimedNotice,
} from "@/lib/handover";

describe("handoverKind", () => {
  it("asks for a hub credential only once the order is on the hub's shelf", () => {
    expect(handoverKind({ fulfillmentMode: "pickup", state: "awaiting_collection" })).toBe("hub");
    // Still on the rider's bike to the hub: production-ready is not client-ready.
    expect(handoverKind({ fulfillmentMode: "pickup", state: "out_for_delivery" })).toBeNull();
    expect(handoverKind({ fulfillmentMode: "pickup", state: "ready_for_dispatch" })).toBeNull();
  });

  it("asks for the door code while a rider is on the way", () => {
    for (const state of ["rider_assigned", "picked_up", "out_for_delivery"]) {
      expect(handoverKind({ fulfillmentMode: "delivery", state })).toBe("delivery");
    }
    expect(handoverKind({ fulfillmentMode: null, state: "out_for_delivery" })).toBe("delivery");
  });

  it("asks for nothing before the order is ready or after it changed hands", () => {
    for (const state of ["production", "delivered", "issue_window_open", "completed"]) {
      expect(handoverKind({ fulfillmentMode: "delivery", state })).toBeNull();
      expect(handoverKind({ fulfillmentMode: "pickup", state })).toBeNull();
    }
  });
});

describe("the code as it is read", () => {
  it("splits six digits into two halves", () => {
    expect(formatHandoverCode("482913")).toBe("482 913");
    expect(formatHandoverCode("004210")).toBe("004 210");
  });

  it("leaves anything that is not six digits alone rather than guessing", () => {
    expect(formatHandoverCode("12345")).toBe("12345");
  });

  it("is spoken as digits", () => {
    expect(spokenHandoverCode("482913")).toBe("4 8 2, 9 1 3");
  });

  it("tells a hub credential from a door code by its QR token", () => {
    expect(isHubHandover({ otp: "482913", qrToken: "tok" })).toBe(true);
    expect(isHubHandover({ otp: "482913" })).toBe(false);
    expect(isHubHandover(null)).toBe(false);
  });
});

describe("unclaimedNotice", () => {
  it("says nothing on the day the order is ready", () => {
    expect(unclaimedNotice({ missedDays: 0, operationsRequired: false, redeliveryRequest: null })).toBeNull();
    expect(unclaimedNotice(null)).toBeNull();
  });

  it("reminds after one missed hub day", () => {
    expect(unclaimedNotice({ missedDays: 1 })).toMatchObject({ tone: "info", title: "1 hub day missed" });
  });

  it("warns after two, naming what the third brings", () => {
    const notice = unclaimedNotice({ missedDays: 2 });
    expect(notice).toMatchObject({ tone: "warning", title: "2 hub days missed" });
    expect(notice?.body).toMatch(/third missed day, Operations contacts you/);
  });

  it("hands over to Operations after three, and never says forfeited without 'not'", () => {
    const notice = unclaimedNotice({ missedDays: 3, operationsRequired: true });
    expect(notice).toMatchObject({ tone: "warning", title: "3 hub days missed" });
    expect(notice?.body).toMatch(/is not forfeited/);
    expect(notice?.body).toMatch(/redelivered at your own cost/);
  });

  it("follows Operations' flag even when the count is missing", () => {
    expect(unclaimedNotice({ operationsRequired: true })?.title).toBe("Hub days missed");
  });

  it("says a redelivery request is with Operations once it is sent", () => {
    const notice = unclaimedNotice({
      missedDays: 4,
      operationsRequired: true,
      redeliveryRequest: { status: "pending_operations", costAccepted: true, at: "2026-10-06T02:00:00Z" },
    });
    expect(notice).toMatchObject({ tone: "info", title: "Redelivery requested" });
  });
});

describe("redeliveryOffered", () => {
  it("is offered once Operations is following up, and only until asked", () => {
    expect(redeliveryOffered({ operationsRequired: false })).toBe(false);
    expect(redeliveryOffered({ operationsRequired: true, redeliveryRequest: null })).toBe(true);
    expect(
      redeliveryOffered({
        operationsRequired: true,
        redeliveryRequest: { status: "pending_operations", costAccepted: true, at: "2026-10-06T02:00:00Z" },
      }),
    ).toBe(false);
  });
});
