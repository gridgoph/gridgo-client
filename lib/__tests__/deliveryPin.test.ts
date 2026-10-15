import type { DeliveryPin, DeliveryPinChange, Notification, Order } from "@/lib/api";
import {
  appliedChangeLine,
  changeAllowanceLine,
  deliveryPinNeedsClient,
  deliveryPinNextAction,
  deliveryPinNotificationCopy,
  deliveryPinView,
  feeDifferenceDetail,
  feeDifferenceLine,
  pinZoneLabel,
  receiverLine,
} from "@/lib/deliveryPin";
import { presentNotification } from "@/lib/notificationPresentation";
import { orderNextAction } from "@/lib/orderState";

const point = { lat: 7.07, lng: 125.61, label: "12 Quimpo Blvd, Davao City" };
const newPoint = { lat: 7.12, lng: 125.64, label: "Main gate, Davao City" };

function pin(patch: Partial<DeliveryPin> = {}): DeliveryPin {
  return {
    version: 1,
    status: "pending",
    requestedAt: "2026-10-15T02:00:00.000Z",
    confirmedAt: null,
    point,
    zone: "away",
    notes: "",
    receiverName: "",
    changeUsed: false,
    canConfirm: true,
    canChange: true,
    original: point,
    change: null,
    ...patch,
  };
}

function change(patch: Partial<DeliveryPinChange> = {}): DeliveryPinChange {
  return {
    id: "pin_1",
    status: "pending_payment",
    point: newPoint,
    zone: "long_distance",
    distanceMeters: 9100,
    deliveryFeeMinor: 15000,
    feeDifferenceMinor: 6000,
    createdAt: "2026-10-15T03:00:00.000Z",
    ...patch,
  };
}

const order = (deliveryPin: DeliveryPin | null, patch: Partial<Order> = {}) =>
  ({ id: "ord_1", state: "ready_for_dispatch", fulfillmentMode: "delivery", deliveryPin, ...patch }) as Order;

describe("deliveryPinView", () => {
  it("asks while the pin is unconfirmed and still confirmable", () => {
    expect(deliveryPinView(order(pin()))?.kind).toBe("ask");
    expect(deliveryPinNeedsClient(order(pin()))).toBe(true);
  });

  it("has nothing to show on a legacy or pick-up order", () => {
    expect(deliveryPinView(order(null))).toBeNull();
    expect(deliveryPinView(order(pin(), { fulfillmentMode: "pickup" }))).toBeNull();
  });

  it("asks for the surcharge while an unpaid change can still be saved", () => {
    const view = deliveryPinView(order(pin({ change: change() })));
    expect(view?.kind).toBe("pay");
    expect(deliveryPinNextAction(order(pin({ change: change() })))?.title).toBe("Pay ₱60.00 for your new pin");
  });

  it("waits quietly while Operations checks the transfer", () => {
    const checking = pin({ canChange: false, change: change({ status: "pending_confirmation" }) });
    expect(deliveryPinView(order(checking))?.kind).toBe("checking");
    expect(deliveryPinNeedsClient(order(checking))).toBe(false);
  });

  it("drops an unpaid proposal once a rider is assigned, and still asks for presence", () => {
    const view = deliveryPinView(order(pin({ canChange: false, change: change() }), { state: "rider_assigned" }));
    expect(view).toMatchObject({ kind: "ask", lapsed: { id: "pin_1" } });
  });

  it("drops an unpaid proposal when the client kept the original pin after it", () => {
    const kept = pin({ status: "confirmed", confirmedAt: "2026-10-15T04:00:00.000Z", change: change() });
    expect(deliveryPinView(order(kept))).toMatchObject({ kind: "set", lapsed: { id: "pin_1" } });
  });

  it("is settled once confirmed, with no ask", () => {
    const confirmed = pin({ status: "confirmed", confirmedAt: "2026-10-15T04:00:00.000Z" });
    expect(deliveryPinView(order(confirmed))?.kind).toBe("set");
    expect(orderNextAction(order(confirmed))).toBeNull();
  });
});

describe("words", () => {
  it("says the difference in the client's terms", () => {
    expect(feeDifferenceLine(6000)).toBe("₱60.00 more to deliver here");
    expect(feeDifferenceLine(-4000)).toBe("₱40.00 back to you");
    expect(feeDifferenceLine(0)).toBe("Same delivery fee");
    expect(feeDifferenceDetail(6000)).toMatch(/until then your rider keeps the original pin/);
    expect(feeDifferenceDetail(-4000)).toMatch(/delivery-fee credit, and your order carries on/);
  });

  it("says what the one change allows", () => {
    expect(changeAllowanceLine(pin(), { kind: "ask", pin: pin(), lapsed: null })).toBe(
      "You can change this pin once, until a rider is assigned.",
    );
    const used = pin({ changeUsed: true, canChange: false });
    expect(changeAllowanceLine(used, { kind: "set", pin: used, lapsed: null })).toBe("You have used your one pin change.");
    const locked = pin({ canChange: false });
    expect(changeAllowanceLine(locked, { kind: "set", pin: locked, lapsed: null })).toMatch(/A rider is assigned/);
  });

  it("names the receiver and the zone", () => {
    expect(receiverLine({ receiverName: "" })).toBe("You receive it");
    expect(receiverLine({ receiverName: "Alex" })).toBe("Alex receives it");
    expect(pinZoneLabel("out_of_zone")).toBe("Out of Zone");
    expect(pinZoneLabel("nearby", { deliveryFeeBands: [{ zone: "nearby", label: "Close by" }] } as never)).toBe("Close by");
  });

  it("describes an applied change without the platform's share", () => {
    expect(appliedChangeLine(change({ status: "applied", feeDifferenceMinor: -4000 }))).toBe(
      "Pin change · ₱40.00 delivery-fee credit",
    );
    expect(appliedChangeLine(change())).toBeNull();
  });

  it("puts the pin ask on Home's docket", () => {
    expect(orderNextAction(order(pin()))).toMatchObject({ title: "Confirm your delivery pin", icon: "map-pin" });
  });
});

describe("inbox", () => {
  const row = (type: string, orderState = "ready_for_dispatch"): Notification => ({
    id: `n_${type}`,
    userId: "u",
    type,
    orderId: "ord_1",
    orderState,
    fulfillmentMode: "delivery",
    title: "Delivery pin",
    body: "The client confirmed they will be at the delivery pin. Refresh the order for the receiver and notes.",
    read: false,
    at: "2026-10-15T04:00:00.000Z",
  });

  it("never shows the staff wording the API shares with Operations", () => {
    const presented = presentNotification(row("delivery_pin_confirmed"));
    expect(presented.title).toBe(deliveryPinNotificationCopy("delivery_pin_confirmed")?.title);
    expect(presented.body).not.toMatch(/The client/);
    expect(presented.lane).toBe("update");
  });

  it("asks while the order has not left, and stops asking once it is delivered", () => {
    const asked = presentNotification(row("delivery_pin_requested"));
    expect(asked.lane).toBe("need_you");
    expect(asked.callout?.title).toBe("Confirm your delivery pin");
    const late = presentNotification(row("delivery_pin_requested", "delivered"));
    expect(late.lane).toBe("update");
    expect(late.callout).toBeNull();
  });

  it("asks for the surcharge only before dispatch", () => {
    expect(presentNotification(row("delivery_pin_proposed")).callout?.title).toBe("Pay the delivery difference");
    expect(presentNotification(row("delivery_pin_proposed", "rider_assigned")).callout).toBeNull();
  });
});
