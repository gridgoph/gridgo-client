import type { Order } from "@/lib/api";
import { refundOrder } from "@/test/refundFixtures";

const HOUR = 60 * 60 * 1000;

/**
 * A paid order handed over two hours ago, its check window open for another
 * 22 — the received view of the order screen (report 5A28D524).
 */
export function receivedOrder(overrides: Partial<Order> = {}): Order {
  const opened = new Date(Date.now() - 2 * HOUR).toISOString();
  return refundOrder({
    state: "issue_window_open",
    riderId: "user_rider",
    issueWindowOpenedAt: opened,
    issueWindowExpiresAt: new Date(Date.now() + 22 * HOUR).toISOString(),
    timeline: [
      { at: opened, state: "delivered", by: "user_rider", note: "" },
      { at: opened, state: "issue_window_open", by: "system", note: "" },
    ],
    ...overrides,
  });
}

/** The same order once the window has closed with nothing reported. */
export function completedOrder(overrides: Partial<Order> = {}): Order {
  const delivered = new Date(Date.now() - 30 * HOUR).toISOString();
  const closed = new Date(Date.now() - 6 * HOUR).toISOString();
  return receivedOrder({
    state: "completed",
    issueWindowOpenedAt: delivered,
    issueWindowExpiresAt: closed,
    timeline: [
      { at: delivered, state: "delivered", by: "user_rider", note: "" },
      { at: delivered, state: "issue_window_open", by: "system", note: "" },
      { at: closed, state: "completed", by: "system", note: "Issue window expired with no active claim" },
    ],
    ...overrides,
  });
}
