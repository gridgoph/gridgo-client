import type { Notification } from "@/lib/api";
import {
  groupInbox,
  isGroupUnread,
  partitionInbox,
  presentNotification,
  timelineRows,
} from "@/lib/notificationPresentation";

function note(partial: Partial<Notification> & Pick<Notification, "title" | "body">): Notification {
  return {
    id: "ntf_1",
    userId: "user_client",
    read: false,
    at: "2026-09-01T05:16:00.000Z",
    ...partial,
  };
}

describe("presentNotification", () => {
  describe("hub pick-up reminders (gridgo-api#124)", () => {
    const hub = (type: string, body: string) =>
      presentNotification(
        note({
          title: "Pickup at GRIDGO",
          body,
          type,
          orderId: "ord_1",
          orderState: "awaiting_collection",
          fulfillmentMode: "pickup",
        }),
      );

    it("says the order is ready and points at the claim code", () => {
      const view = hub("hub_ready", "Your order is ready. Bring its QR and matching code during hub hours.");
      expect(view.title).toBe("Ready at the hub");
      expect(view.body).toMatch(/QR and matching code/);
      expect(view.hint).toBe("Open for your claim code");
      expect(view.lane).toBe("need_you");
      expect(view.callout).toMatchObject({ tone: "success", detail: "Show the QR and code from the order." });
    });

    it("keeps the server's count of missed days", () => {
      const view = hub("hub_unclaimed_reminder", "Your order is still waiting at the hub. Bring its QR and matching code.");
      expect(view.title).toBe("Still waiting at the hub");
      expect(view.body).toMatch(/still waiting at the hub/);
      expect(view.lane).toBe("need_you");
    });

    it("warns on the second missed day", () => {
      const view = hub("hub_unclaimed_warning", "Two hub days missed. Please collect your order on the next hub day.");
      expect(view.title).toBe("Collect your order soon");
      expect(view.callout?.title).toBe("Collect at GRIDGO Office");
    });

    it("offers the choice once Operations follows up, never forfeiture", () => {
      const view = hub(
        "hub_unclaimed_warning",
        "Three hub days missed. Contact Operations or request redelivery at your own cost. Your order is not forfeited.",
      );
      expect(view.title).toBe("Operations will follow up");
      expect(view.body).toMatch(/not forfeited/);
      expect(view.callout).toMatchObject({ tone: "warning", title: "Collect it, or ask for redelivery" });
    });

    it("does not keep asking once the order has been collected", () => {
      const view = presentNotification(
        note({
          title: "Pickup at GRIDGO",
          body: "Your order is ready. Bring its QR and matching code during hub hours.",
          type: "hub_ready",
          orderId: "ord_1",
          orderState: "issue_window_open",
          fulfillmentMode: "pickup",
        }),
      );
      expect(view.title).toBe("Collected");
      expect(view.callout).toBeNull();
    });
  });

  it("turns a pickup that is still travelling into a counter docket, not a door delivery", () => {
    const view = presentNotification(
      note({
        title: "Out for delivery",
        body: "Your order is on the way.",
        type: "order_out_for_delivery",
        orderId: "ord_1",
        orderTitle: "Flyers",
        orderState: "out_for_delivery",
        fulfillmentMode: "pickup",
      }),
    );

    expect(view.stamp).toMatch(/COLLECT/i);
    expect(view.title).toMatch(/GRIDGO Office/i);
    expect(view.title).not.toMatch(/out for delivery/i);
    expect(view.body).not.toMatch(/on the way to you/i);
    expect(view.railKind).toBe("collect");
    expect(view.stageIndex).toBe(2);
    expect(view.jobLine).toBe("Flyers");
    expect(view.lane).toBe("update");
  });

  it("puts a paid collect job in Needs you, waiting at the counter", () => {
    const view = presentNotification(
      note({
        title: "Ready for pickup",
        body: "Your order is waiting for you at the GRIDGO Office counter.",
        type: "order_ready_for_pickup",
        orderId: "ord_1",
        orderTitle: "Seminar handouts",
        orderState: "awaiting_collection",
        fulfillmentMode: "pickup",
        collectHold: false,
      }),
    );

    expect(view.stamp).toBe("COLLECT AT THE COUNTER");
    expect(view.title).toMatch(/counter/i);
    expect(view.collectReady).toBe(true);
    expect(view.collectHold).toBe(false);
    expect(view.lane).toBe("need_you");
    expect(view.stageIndex).toBe(3);
    expect(view.hint).toMatch(/address/i);
  });

  it("tells an unpaid collect job to settle before travelling", () => {
    const view = presentNotification(
      note({
        title: "Ready for pickup",
        body: "Your order is waiting at GRIDGO Office. Settle the remaining balance in the app, then collect it at the counter.",
        type: "order_ready_for_pickup",
        orderId: "ord_1",
        orderTitle: "Booth backdrops",
        orderState: "awaiting_collection",
        fulfillmentMode: "pickup",
        collectHold: true,
      }),
    );

    expect(view.stamp).toBe("COLLECT · PAY FIRST");
    expect(view.title).toMatch(/settle/i);
    expect(view.collectHold).toBe(true);
    expect(view.collectReady).toBe(false);
    expect(view.hint).toMatch(/pay/i);
  });

  it("leaves a door delivery on the delivery rail", () => {
    const view = presentNotification(
      note({
        title: "Out for delivery",
        body: "Your order is on the way.",
        type: "order_out_for_delivery",
        orderState: "out_for_delivery",
        fulfillmentMode: "delivery",
        orderTitle: "Tarpaulin",
      }),
    );

    expect(view.stamp).toBe("ON THE WAY TO YOU");
    expect(view.title).toBe("Out for delivery");
    expect(view.railKind).toBe("delivery");
    expect(view.stageIndex).toBe(2);
  });
});

describe("presentNotification job reference", () => {
  it("carries the job's reference in the form a person reads out", () => {
    const view = presentNotification(
      note({
        title: "Payment confirmed",
        body: "Open GRIDGO to review the latest update.",
        orderId: "ord_3ff0128e105a",
        orderState: "payment_authorized",
      }),
    );
    expect(view.reference).toBe("3FF0-128E-105A");
    expect(presentNotification(note({ title: "News", body: "A broadcast." })).reference).toBeNull();
  });
});

describe("presentNotification for a closed job", () => {
  it("says the job is complete rather than reading the state name aloud", () => {
    const view = presentNotification(
      note({
        title: "Completed",
        body: "This order is complete.",
        type: "order_completed",
        orderId: "ord_1",
        orderTitle: "Grand opening tarpaulin",
        orderState: "completed",
        fulfillmentMode: "delivery",
      }),
    );

    expect(view.stamp).toBe("JOB COMPLETE");
    expect(view.title).toBe("Job complete");
    expect(view.reference).toBe("ORD_1".replace("ORD_", ""));
    expect(view.body).toMatch(/delivered/);
    expect(view.body).toMatch(/nothing more is needed from you/);
    expect(view.lane).toBe("update");
    expect(view.stageIndex).toBe(3);
  });

  it("says collected, not delivered, for a job fetched from the counter", () => {
    const view = presentNotification(
      note({
        title: "Completed",
        body: "This order is complete.",
        type: "order_completed",
        orderId: "ord_1",
        orderTitle: "Seminar handouts",
        orderState: "payout_released",
        fulfillmentMode: "pickup",
      }),
    );

    expect(view.stamp).toBe("JOB COMPLETE");
    expect(view.title).toBe("Job complete");
    expect(view.body).toMatch(/collected at GRIDGO Office/);
    expect(view.body).not.toMatch(/delivered/);
  });
});

describe("presentNotification rating reminder", () => {
  it("asks for a rating without calling the job closed", () => {
    const view = presentNotification(
      note({
        title: "How did it go?",
        body: "Rate this job.",
        type: "order_rate_reminder",
        orderId: "ord_1",
        orderTitle: "Flyers",
        orderState: "completed",
        fulfillmentMode: "delivery",
      }),
    );

    expect(view.title).toBe("How did it go?");
    expect(view.body).toMatch(/rate this job/i);
    expect(view.body).not.toMatch(/nothing more is needed from you/);
    expect(view.lane).toBe("need_you");
    expect(view.hint).toMatch(/rate/i);
  });
});

describe("presentNotification receipt ready", () => {
  it("points at the acknowledgement receipt", () => {
    const view = presentNotification(
      note({
        title: "Your receipt is ready",
        body: "Open it.",
        type: "order_receipt_ready",
        orderId: "ord_1",
        orderTitle: "Flyers",
        orderState: "needs_qa",
      }),
    );

    expect(view.title).toBe("Your receipt is ready");
    expect(view.body).toMatch(/printing/);
    expect(view.hint).toMatch(/receipt/i);
    expect(view.lane).toBe("update");
  });

  const receiptReady = note({
    title: "Your receipt is ready",
    body: "Open the receipt to see printing, delivery, the service fee and your payment reference.",
    type: "order_receipt_ready",
    orderId: "ord_1",
    orderTitle: "Flyers",
    orderState: "needs_qa",
  });

  it("never names the fee while Operations hides it, even when the server's body does", () => {
    for (const view of [
      presentNotification(receiptReady),
      presentNotification(receiptReady, { showServiceFee: false }),
    ]) {
      expect(`${view.title} ${view.body}`).not.toMatch(/service fee|\d+(\.\d+)?\s*%/i);
      expect(view.body).toBe("It lists printing, delivery, the total and your payment reference.");
    }
  });

  it("names the fee when Operations shows it", () => {
    expect(presentNotification(receiptReady, { showServiceFee: true }).body).toMatch(/the service fee/);
  });
});

describe("groupInbox", () => {
  const step = (id: string, at: string, extra: Partial<Notification> = {}) =>
    note({
      id,
      at,
      orderId: "ord_1F09",
      orderTitle: "Booth backdrops",
      orderState: "ready_for_dispatch",
      title: `Update ${id}`,
      body: "Something moved.",
      paymentAction: { installment: "final_online", status: "pending_confirmation", amountMinor: 33625 },
      ...extra,
    });

  it("folds one job's five updates into one group led by the newest", () => {
    const rows = [
      step("a", "2026-09-01T01:00:00.000Z"),
      step("c", "2026-09-01T03:00:00.000Z"),
      step("b", "2026-09-01T02:00:00.000Z"),
      step("e", "2026-09-01T05:00:00.000Z"),
      step("d", "2026-09-01T04:00:00.000Z"),
    ];

    const groups = groupInbox(rows);

    expect(groups).toHaveLength(1);
    expect(groups[0].orderId).toBe("ord_1F09");
    expect(groups[0].latest.id).toBe("e");
    expect(groups[0].items.map((item) => item.id)).toEqual(["e", "d", "c", "b", "a"]);
    // The payment callout belongs to the job, so the card says it once.
    expect(presentNotification(groups[0].latest).callout?.title).toMatch(/^Final payment ₱336\.25/);
  });

  it("keeps a row with no job as its own card, and orders cards by their newest update", () => {
    const broadcast = note({ id: "ann", title: "Holiday hours", body: "Closed Monday.", at: "2026-09-01T02:30:00.000Z" });
    const other = step("x", "2026-09-01T02:00:00.000Z", { orderId: "ord_other" });
    const groups = groupInbox([
      step("a", "2026-09-01T01:00:00.000Z"),
      other,
      broadcast,
      step("b", "2026-09-01T03:00:00.000Z"),
    ]);

    expect(groups.map((group) => group.key)).toEqual(["order:ord_1F09", "note:ann", "order:ord_other"]);
    expect(groups[1].items).toEqual([broadcast]);
    expect(groups[1].orderId).toBeNull();
  });

  it("never merges two unrelated rows that have no job", () => {
    const groups = groupInbox([
      note({ id: "n1", title: "One", body: "x" }),
      note({ id: "n2", title: "Two", body: "y" }),
    ]);
    expect(groups).toHaveLength(2);
  });

  it("keeps the server's order when a stamp cannot be read", () => {
    const groups = groupInbox([
      step("first", "not a date"),
      step("second", "also not a date"),
    ]);
    expect(groups[0].items.map((item) => item.id)).toEqual(["first", "second"]);
  });
});

describe("isGroupUnread", () => {
  const rows = [
    note({ id: "new", title: "Out for delivery", body: "x", orderId: "o", at: "2026-09-01T03:00:00.000Z" }),
    note({ id: "old", title: "Printing", body: "y", orderId: "o", at: "2026-09-01T01:00:00.000Z" }),
  ];

  it("is unread when the job's newest update is unread", () => {
    const [group] = groupInbox(rows);
    expect(isGroupUnread(group, (item) => item.id === "old")).toBe(true);
  });

  it("reads as read once the newest update is, even with an older one unread", () => {
    const [group] = groupInbox(rows);
    expect(isGroupUnread(group, (item) => item.id === "new")).toBe(false);
  });
});

describe("partitionInbox", () => {
  it("lifts collect-ready and pay-first above ordinary updates", () => {
    const ready = note({
      id: "ntf_ready",
      title: "Waiting at the counter",
      body: "Come collect it.",
      type: "order_ready_for_pickup",
      orderState: "awaiting_collection",
      fulfillmentMode: "pickup",
      collectHold: false,
    });
    const printing = note({
      id: "ntf_print",
      title: "Your job is in production",
      body: "The shop has started.",
      type: "order_in_production",
      orderState: "production",
      fulfillmentMode: "pickup",
    });

    const { needYou, updates } = partitionInbox([printing, ready]);
    expect(needYou.map((group) => group.latest.id)).toEqual(["ntf_ready"]);
    expect(updates.map((group) => group.latest.id)).toEqual(["ntf_print"]);
  });

  it("files a job by its newest update, not by an older step that once needed the client", () => {
    const proof = note({
      id: "ntf_proof",
      title: "Approve your proof",
      body: "Operations sent a proof.",
      type: "order_proof_approval",
      orderId: "ord_1",
      orderState: "production",
      at: "2026-09-01T01:00:00.000Z",
    });
    const printing = note({
      id: "ntf_print",
      title: "Your job is in production",
      body: "The shop has started.",
      type: "order_in_production",
      orderId: "ord_1",
      orderState: "production",
      at: "2026-09-01T02:00:00.000Z",
    });

    const { needYou, updates } = partitionInbox([proof, printing]);
    expect(needYou).toHaveLength(0);
    expect(updates.map((group) => group.items.map((item) => item.id))).toEqual([
      ["ntf_print", "ntf_proof"],
    ]);
  });
});

describe("presentNotification stage and callout", () => {
  it("names the stage in words for the card's top strip", () => {
    const view = presentNotification(
      note({ title: "Printing has started", body: "On the press.", orderId: "ord_1", orderState: "production" }),
    );
    expect(view.stageLabel).toBe("Printing");
    expect(presentNotification(note({ title: "News", body: "A broadcast." })).stageLabel).toBeNull();
  });

  it("calls a collect job's stage by the counter's name, not the door's", () => {
    const view = presentNotification(
      note({
        title: "Ready for pickup",
        body: "At the counter.",
        type: "order_ready_for_pickup",
        orderId: "ord_1",
        orderState: "awaiting_collection",
        fulfillmentMode: "pickup",
        collectHold: false,
      }),
    );
    expect(view.stageLabel).toBe("Counter");
    expect(view.callout).toMatchObject({ tone: "success", title: "Collect at GRIDGO Office" });
  });

  it("asks a held collect job to pay before travelling, in a callout", () => {
    const view = presentNotification(
      note({
        title: "Ready for pickup",
        body: "Settle the remaining balance first.",
        type: "order_ready_for_pickup",
        orderId: "ord_1",
        orderState: "awaiting_collection",
        fulfillmentMode: "pickup",
        collectHold: true,
      }),
    );
    expect(view.callout).toMatchObject({ tone: "warning", icon: "wallet" });
    expect(view.callout?.title).toMatch(/before you travel/);
    // The body no longer repeats what the callout says.
    expect(view.body).not.toMatch(/balance/i);
  });

  it("asks for the thing an update is about while the job still waits on it", () => {
    const view = presentNotification(
      note({
        title: "Artwork needs a fix",
        body: "The bleed is missing.",
        type: "order_client_correction",
        orderId: "ord_1",
        orderState: "client_correction",
      }),
    );
    expect(view.callout).toMatchObject({ tone: "warning", icon: "upload", title: "Replace the artwork" });
  });

  it("drops the ask once the job has moved past it", () => {
    const view = presentNotification(
      note({
        title: "Supplier assigned and final price ready",
        body: "Review the final price and submit the digital downpayment.",
        type: "supplier_assignment_final_price",
        orderId: "ord_1",
        orderState: "production",
      }),
    );
    expect(view.callout).toBeNull();
  });

  it("has nothing to call out on a plain progress update", () => {
    const view = presentNotification(
      note({ title: "Printing has started", body: "On the press.", orderId: "ord_1", orderState: "production" }),
    );
    expect(view.callout).toBeNull();
  });
});

describe("timelineRows", () => {
  const at = (day: number, hour: number, minute = 0) =>
    new Date(2026, 8, day, hour, minute).toISOString();
  const row = (id: string, when: string) => note({ id, title: `Update ${id}`, body: "", at: when });
  const now = new Date(2026, 8, 20, 18, 0).getTime();

  it("heads each day once and says a time only where it changes", () => {
    const rows = timelineRows(
      [
        row("d", at(20, 13)),
        row("c", at(20, 11)),
        row("b", at(20, 11)),
        row("a", at(19, 10)),
        row("z", at(12, 9)),
      ],
      now,
    );

    expect(rows.map((r) => (r.kind === "day" ? `# ${r.label}` : r.key))).toEqual([
      "# Today",
      "d",
      "c",
      "b",
      "# Yesterday",
      "a",
      `# ${new Date(2026, 8, 12).toLocaleDateString("en-PH", { day: "numeric", month: "short" })}`,
      "z",
    ]);
    const entries = rows.filter((r) => r.kind === "entry");
    expect(entries.map((r) => r.time === null)).toEqual([false, false, true, false, false]);
    // A shared time is still spoken exactly.
    expect(entries[2].exact).toBe(entries[1].exact);
    expect(entries[2].exact).not.toBe("—");
  });

  it("files an unreadable stamp under its own heading rather than guessing a day", () => {
    const rows = timelineRows([row("x", "not a date")], now);
    expect(rows[0]).toMatchObject({ kind: "day", label: "Date unknown" });
    expect(rows[1]).toMatchObject({ kind: "entry", time: null });
  });
});

describe("when the shop cannot carry on", () => {
  it("draws a shop that could not take the order as a choice the client owes", () => {
    const view = presentNotification(
      note({
        title: "Order fulfilment update",
        body: "The original shop could not fulfil your order. A vetted replacement is available. Accept the revised date or choose a full refund.",
        type: "shop_recovery",
        orderId: "ord_1",
        orderState: "production",
      }),
    );
    expect(view.title).toBe("Your shop could not take this order");
    expect(view.lane).toBe("need_you");
    expect(view.callout?.title).toBe("Choose the new shop or a refund");
    expect(view.hint).toBe("Opens this job");
  });

  it("asks for an answer to the shop's new date within the window", () => {
    const view = presentNotification(
      note({
        title: "Order deadline request",
        body: "A new production deadline needs the client’s answer within 24 hours.",
        type: "order_reschedule_requested",
        orderId: "ord_1",
        orderState: "production",
      }),
    );
    expect(view.title).toBe("Your shop asked for more time");
    expect(view.body).not.toMatch(/the client/i);
    expect(view.lane).toBe("need_you");
    expect(view.callout).toEqual(expect.objectContaining({ icon: "clock", title: "Answer within 24 hours" }));
  });

  it("files an expired request as an update that says Operations will call", () => {
    const view = presentNotification(
      note({
        title: "Order deadline request",
        body: "The client did not answer within 24 hours. The original deadline still applies; Operations must follow up.",
        type: "order_reschedule_expired",
        orderId: "ord_1",
        orderState: "production",
      }),
    );
    expect(view.lane).toBe("update");
    expect(view.body).toMatch(/Operations will contact you/);
    expect(view.callout).toBeNull();
  });
});

it("never asks for a payment on a row about a shop that dropped the job", () => {
  const view = presentNotification(
    note({
      title: "Order fulfilment update",
      body: "The shop cannot fulfil this order. Operations is reviewing the next step.",
      type: "shop_recovery",
      orderId: "ord_1",
      orderState: "production",
      paymentAction: { installment: "final_online", status: "due", amountMinor: 111250 },
    }),
  );
  expect(view.callout).toBeNull();
  expect(view.lane).toBe("update");
  expect(view.hint).toBe("Opens this job");
});
