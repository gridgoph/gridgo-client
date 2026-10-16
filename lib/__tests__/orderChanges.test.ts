import type { Notification, Order, OrderChangeRequest } from "@/lib/api";
import { presentNotification } from "@/lib/notificationPresentation";
import {
  approveNote,
  changeKindLabel,
  changeNextAction,
  changeNotificationCopy,
  changePriceLine,
  changeRequestView,
  changeNeedsClient,
  itemNote,
  openChangeRequest,
  paidChanges,
  settledChangeLabel,
  settledChanges,
  specialInstructionsCount,
  specialInstructionsLength,
  specialInstructionsProblem,
} from "@/lib/orderChanges";
import { orderNextAction, orderTotalMinor, orderWaitingOn } from "@/lib/orderState";

function change(patch: Partial<OrderChangeRequest> = {}): OrderChangeRequest {
  return {
    id: "change_1",
    orderId: "ord_1",
    lineItemId: "line_1",
    status: "pending",
    version: 1,
    totalMinor: 11000,
    createdAt: "2026-10-15T02:00:00.000Z",
    reason: "The staple needs extra finishing.",
    proposedSpec: "Staple on the left; same paper.",
    proposedPromiseBy: null,
    originalInstructions: "Staple on the left please",
    ...patch,
  };
}

const order = (changeRequests: OrderChangeRequest[], patch: Partial<Order> = {}): Order =>
  ({
    id: "ord_1",
    state: "production",
    fulfillmentMode: "delivery",
    totalMinor: 52900,
    deliveryFeeMinor: 6000,
    payments: {},
    productionItems: [{ id: "line_1", itemName: "Flyers — A5" }],
    changeRequests,
    ...patch,
  }) as unknown as Order;

describe("special instructions", () => {
  it("counts characters the way the server does, not UTF-16 units", () => {
    expect(specialInstructionsLength("  👕 names  ")).toBe(7);
    expect(specialInstructionsCount("abc")).toBe("3 / 300");
  });

  it("refuses an over-long note with how much to remove, and never truncates", () => {
    expect(specialInstructionsProblem("x".repeat(300))).toBeNull();
    expect(specialInstructionsProblem("x".repeat(305))).toBe(
      "Keep special instructions to 300 characters. Remove 5 to save.",
    );
  });

  it("reads an item's note and the change agreed since", () => {
    expect(itemNote({ specialInstructions: "  ", agreedChange: null })).toEqual({ note: null, agreed: null });
    expect(
      itemNote({
        specialInstructions: "Darker lines",
        agreedChange: { id: "c", proposedSpec: "Bolder lines, 0.5pt", appliedAt: "2026-10-15T03:00:00Z" },
      }),
    ).toEqual({ note: "Darker lines", agreed: "Bolder lines, 0.5pt" });
  });
});

describe("change requests", () => {
  it("asks the client to answer a pending request, on Home and on the order", () => {
    const pending = order([change()]);
    expect(changeRequestView(pending)).toMatchObject({ kind: "answer", itemName: "Flyers — A5" });
    expect(changeNeedsClient(pending)).toBe(true);
    expect(orderNextAction(pending)).toMatchObject({ title: "Answer the shop's change request", icon: "square-pen" });
    expect(changeNextAction(pending)?.body).toContain("₱110.00 more");
  });

  it("asks for the QR top-up once a priced change is approved", () => {
    const approved = order([change({ status: "pending_payment", version: 2 })]);
    expect(changeRequestView(approved)?.kind).toBe("pay");
    expect(orderNextAction(approved)?.title).toBe("Pay ₱110.00 for your change");
  });

  it("waits on Operations once the transfer is sent, asking nothing", () => {
    const sent = order([
      change({ status: "pending_confirmation", payment: { proofFileId: "f", reference: "REF1", submittedAt: "2026-10-15T04:00:00Z" } }),
    ]);
    expect(changeRequestView(sent)?.kind).toBe("checking");
    expect(changeNeedsClient(sent)).toBe(false);
    expect(orderNextAction(sent)).toBeNull();
    expect(orderWaitingOn(sent)).toMatch(/checking your payment for the change/);
  });

  it("treats settled requests as history, newest first", () => {
    const rows = [
      change({ id: "a", status: "declined", totalMinor: 0 }),
      change({ id: "b", status: "applied" }),
      change({ id: "c", status: "closed" }),
    ];
    const settled = order(rows);
    expect(openChangeRequest(settled)).toBeNull();
    expect(changeRequestView(settled)).toBeNull();
    expect(settledChanges(settled).map((row) => row.id)).toEqual(["c", "b", "a"]);
    expect(settledChangeLabel(rows[1])).toBe("Approved · ₱110.00 paid by QR");
    expect(settledChangeLabel(rows[0])).toBe("Declined · order kept as placed");
    expect(settledChangeLabel(change({ status: "something_new" }))).toBe("Closed · order kept as placed");
  });

  it("adds paid changes to the order's total, fee inside, and nothing unpaid", () => {
    const paid = order([change({ status: "applied" }), change({ id: "x", status: "pending_payment" })], {
      supplementalTotalMinor: 11000,
    });
    expect(paidChanges(paid).map((row) => row.id)).toEqual(["change_1"]);
    expect(orderTotalMinor(paid)).toBe(63900);
    expect(orderTotalMinor(order([]))).toBe(52900);
  });

  it("says what approving does before the tap: pay first for a priced change", () => {
    expect(approveNote(change())).toMatch(/^Next you pay ₱110.00 by QR\. The shop starts the change only once Operations confirms/);
    expect(approveNote(change({ totalMinor: 0 }))).toMatch(/straight away, at no extra cost/);
    expect(changePriceLine(change({ totalMinor: 0 }))).toBe("No extra cost");
  });

  it("names what would change", () => {
    expect(changeKindLabel(change())).toBe("A change to the item");
    expect(changeKindLabel(change({ proposedSpec: "", proposedPromiseBy: "2026-11-01T08:00:00Z" }))).toBe("A new ready date");
    expect(changeKindLabel(change({ proposedPromiseBy: "2026-11-01T08:00:00Z" }))).toBe(
      "A change to the item and its ready date",
    );
  });
});

describe("change notifications", () => {
  const row = (type: string, orderState = "production"): Notification => ({
    id: `n_${type}`,
    userId: "u",
    type,
    orderId: "ord_1",
    orderState,
    fulfillmentMode: "delivery",
    title: "Order change request",
    body: "An order change request was updated. Open the order to review its terms and status.",
    read: false,
    at: "2026-10-15T04:00:00.000Z",
  });

  it("replaces the generic body the API shares with the shop and Operations", () => {
    const presented = presentNotification(row("order_change_applied"));
    expect(presented.title).toBe(changeNotificationCopy("order_change_applied")?.title);
    expect(presented.body).not.toMatch(/order change request was updated/);
    expect(presented.lane).toBe("update");
  });

  it("asks while the job is printing, and stops asking once printing is done", () => {
    const asked = presentNotification(row("order_change_requested"));
    expect(asked.lane).toBe("need_you");
    expect(asked.callout?.title).toBe("Approve or decline the change");
    const late = presentNotification(row("order_change_requested", "ready_for_dispatch"));
    expect(late.lane).toBe("update");
    expect(late.callout).toBeNull();
  });

  it("asks again after a transfer Operations could not match", () => {
    const rejected = presentNotification(row("order_change_payment_rejected"));
    expect(rejected.lane).toBe("need_you");
    expect(rejected.callout?.title).toBe("Check the reason and send it again");
  });
});
