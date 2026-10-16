import { parseDeadline } from "@/lib/deadline";

export const READY_TIME_EXPLANATION = "Includes artwork review, jobs ahead and opening hours.";

/** Only the API's client promise belongs here, never press time or a requested deadline. */
export function readyByDate(promiseBy: string | null | undefined): string | null {
  const date = parseDeadline(promiseBy);
  if (!date) return null;
  // The presses and their calendar are in Davao, even if the phone is elsewhere.
  const day = date.toLocaleDateString("en-PH", {
    timeZone: "Asia/Manila",
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const time = date.toLocaleTimeString("en-PH", {
    timeZone: "Asia/Manila",
    hour: "numeric",
    minute: "2-digit",
  });
  return `${day} · ${time}`;
}

/**
 * "Ready early" — the API's own words — once printing finished before the
 * shop's deadline (gridgo-api#219). Never worked out here: the client never
 * receives that deadline. It does not mean the job is on its way.
 */
export function readyEarlyLabel(
  order: { readyEarly?: boolean | null; readyLabel?: string | null; state?: string } | null | undefined,
): string | null {
  if (!order || order.readyEarly !== true || order.state === "cancelled") return null;
  return order.readyLabel?.trim() || "Ready early";
}
