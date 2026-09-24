import { parseDeadline } from "@/lib/deadline";

export const READY_TIME_EXPLANATION = "Includes jobs ahead and shop opening hours.";

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
