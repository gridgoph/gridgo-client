/**
 * What the yellow "+" opens (client#335): one sheet of the things a client
 * starts from anywhere in the app.
 *
 * Pure. The sheet draws this list as it comes; an action that cannot be used
 * right now stays on the list, disabled, with the reason in place of its
 * description — a row that comes and goes is a menu nobody can learn.
 *
 * Chat is GRIDGO's own support desk, never a shop: clients never talk to a
 * print shop (`lib/gridgoOffice.ts`).
 */

import type { HubSchedule } from "@/lib/api";
import { clockLabel } from "@/lib/hubPickup";

export type QuickActionKey = "start" | "chat" | "track" | "reorder" | "quote" | "report" | "missions";

export type QuickAction = {
  key: QuickActionKey;
  title: string;
  /** The line under the title — or, when disabled, why. */
  detail: string;
  /** Where a tap goes. Reorder has none: it seeds a request first. */
  href: string | null;
  /** Null when the action can be used now. */
  disabledReason: string | null;
  /** A count beside the title ("2 new"). */
  badge: string | null;
  /** A reward tag ("+₱15 TESTER"). */
  tag: string | null;
};

export type QuickActionsInput = {
  startHref: string;
  chatUnread: number;
  /** GRIDGO's hours, read through `supportHoursLine`. */
  supportLine: string;
  activeOrderId: string | null;
  reorderTitle: string | null;
  /** "₱15" while a confirmed bug report would still earn the tester's voucher. */
  bugReward: string | null;
  missions: { done: number; total: number } | null;
};

export const CHAT_ROUTE = "/chat";
export const REPORT_ROUTE = "/report-problem";
export const MISSIONS_ROUTE = "/founding-tester";

function action(fields: Omit<QuickAction, "badge" | "tag" | "disabledReason"> & Partial<QuickAction>): QuickAction {
  return { badge: null, tag: null, disabledReason: null, ...fields };
}

export function quickActions(input: QuickActionsInput): QuickAction[] {
  const list: QuickAction[] = [
    action({ key: "start", title: "Start a new print", detail: "Pick a product. GRIDGO finds the printer.", href: input.startHref }),
    action({
      key: "chat",
      title: "Chat with GRIDGO",
      detail: input.supportLine,
      href: CHAT_ROUTE,
      badge: input.chatUnread > 0 ? `${input.chatUnread > 9 ? "9+" : input.chatUnread} new` : null,
    }),
    input.activeOrderId
      ? action({ key: "track", title: "Track order", detail: "Where your order is now", href: `/order/${encodeURIComponent(input.activeOrderId)}` })
      : action({ key: "track", title: "Track order", detail: "No order in progress", href: null, disabledReason: "No order in progress" }),
    input.reorderTitle
      ? action({ key: "reorder", title: "Reorder", detail: input.reorderTitle, href: null })
      : action({ key: "reorder", title: "Reorder", detail: "No past print yet", href: null, disabledReason: "No past print yet" }),
    action({ key: "quote", title: "Get a quote", detail: "Signage & 3D, quoted in chat", href: CHAT_ROUTE }),
    action({
      key: "report",
      title: "Report a problem",
      detail: "Tell GRIDGO what went wrong",
      href: REPORT_ROUTE,
      tag: input.bugReward ? `+${input.bugReward} TESTER` : null,
    }),
  ];
  if (input.missions) {
    list.push(
      action({
        key: "missions",
        title: "Founding Tester mission",
        detail: `${input.missions.done} / ${input.missions.total}`,
        href: MISSIONS_ROUTE,
      }),
    );
  }
  return list;
}

/* --------------------------------------------------------------------------
   Support hours
   -------------------------------------------------------------------------- */

const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

function localDay(epochMs: number, offsetMinutes: number): { weekday: number; minute: number; iso: string } {
  const local = new Date(epochMs + offsetMinutes * 60_000);
  return {
    weekday: local.getUTCDay(),
    minute: local.getUTCHours() * 60 + local.getUTCMinutes(),
    iso: local.toISOString().slice(0, 10),
  };
}

function closedOn(schedule: HubSchedule, iso: string): boolean {
  return (schedule.closures ?? []).some((closure) => closure.startDay <= iso && iso <= closure.endDay);
}

/**
 * "Support · open until 5:00 PM", or while GRIDGO is closed, when it will
 * answer: "Closed · replies from 8:00 AM Mon". Read from GRIDGO's own opening
 * hours (`settings.operatingHours`), in its own time zone. Without hours set,
 * just "Support" — never invented hours.
 */
export function supportHoursLine(schedule: HubSchedule | null | undefined, now: number = Date.now()): string {
  const week = schedule?.week ?? [];
  if (!schedule || !week.length) return "Support";
  const offset = schedule.utcOffsetMinutes ?? 480;
  const today = localDay(now, offset);
  if (!closedOn(schedule, today.iso)) {
    const open = week.find(
      (window) => window.weekday === today.weekday && window.opensMinute <= today.minute && today.minute < window.closesMinute,
    );
    if (open) return `Support · open until ${clockLabel(open.closesMinute)}`;
  }
  for (let ahead = 0; ahead < 14; ahead += 1) {
    const day = localDay(now + ahead * 86_400_000, offset);
    if (closedOn(schedule, day.iso)) continue;
    const next = week
      .filter((window) => window.weekday === day.weekday && (ahead > 0 || window.opensMinute > today.minute))
      .sort((left, right) => left.opensMinute - right.opensMinute)[0];
    if (!next) continue;
    const when = ahead === 0 ? "" : ahead === 1 ? " tomorrow" : ` ${DAY_SHORT[day.weekday]}`;
    return `Closed · replies from ${clockLabel(next.opensMinute)}${when}`;
  }
  return "Support";
}
