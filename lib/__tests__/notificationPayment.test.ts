import { presentNotification } from "@/lib/notificationPresentation";
import type { Notification } from "@/lib/api";
const event: Notification = { id: "n", userId: "client", orderId: "order", type: "order_in_production", title: "Printing started", body: "Your order entered production.", at: "2026-09-15T00:00:00Z", read: false, eventState: "production", orderState: "out_for_delivery" };
it("keeps historical event stage separate from a current payment action", () => {
  const view = presentNotification({ ...event, paymentAction: { installment: "final_online", status: "due", amountMinor: 77500 } });
  expect(view.title).toBe(event.title);
  expect(view.body).toBe(event.body);
  expect(view.stageIndex).toBe(1);
  expect(view.paymentLine).toContain("₱775.00");
  expect(view.lane).toBe("need_you");
});
it("describes pending review without asking for another transfer", () => {
  const view = presentNotification({ ...event, paymentAction: { installment: "final_online", status: "pending_confirmation", amountMinor: 77500 } });
  expect(view.paymentLine).toContain("Do not pay again");
  expect(view.lane).toBe("update");
});
