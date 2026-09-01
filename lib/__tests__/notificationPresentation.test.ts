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
