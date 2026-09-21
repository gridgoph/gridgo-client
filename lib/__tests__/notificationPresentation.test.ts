import type { Notification } from "@/lib/api";
import {
  partitionInbox,
  presentNotification,
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
    expect(needYou.map((item) => item.id)).toEqual(["ntf_ready"]);
    expect(updates.map((item) => item.id)).toEqual(["ntf_print"]);
  });
});
