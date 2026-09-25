import Constants, { ExecutionEnvironment } from "expo-constants";
import { Platform } from "react-native";

import type { Order } from "@/lib/api";
import { orderReference } from "@/lib/orderReference";
import { orderStateMeta } from "@/lib/orderState";

/**
 * "Report a problem" — a bug report that travels as an ordinary support-chat
 * message to Operations, so the reply lands in Chat like any other.
 *
 * Operations has one desk, and a second inbox for bugs would be a second place
 * nobody watches. What makes a report a report is its first line, which is
 * also what the desk's thread preview shows, and the facts appended under the
 * client's own words that they would otherwise be asked for one at a time.
 *
 * The chat carries text only (`POST /support-chat/me/messages` takes `body`),
 * so a screenshot has nowhere to go yet. The form does not offer one: a picker
 * whose image silently never arrives is worse than no picker.
 */

/** First line of every report. The desk's preview starts here. */
export const BUG_REPORT_HEADING = "Bug report from the client app";

/** Shortest "what happened" that says anything a person can act on. */
export const HAPPENED_MIN = 10;
export const HAPPENED_MAX = 1500;
export const EXPECTED_MAX = 1000;

/** Most recent orders offered in "Which order?" — a report is about now. */
export const ORDER_CHOICES_MAX = 8;

export type BugReportDraft = {
  happened: string;
  /** Optional: a crash rarely needs one. */
  expected: string;
};

/** What the phone knows about itself, as a person reads it. */
export type BugReportDevice = {
  app: string;
  phone: string | null;
  system: string;
};

export type BugReportOrder = Pick<Order, "id" | "title" | "state" | "fulfillmentMode" | "payments"> &
  Partial<Pick<Order, "balanceMinor" | "downpaymentPercent">>;

/** Why the report cannot go yet, or null when it can. */
export function bugReportProblem(draft: BugReportDraft): string | null {
  const happened = draft.happened.trim();
  if (!happened) return "Say what happened.";
  if (happened.length < HAPPENED_MIN) {
    return `A little more, please — at least ${HAPPENED_MIN} characters on what you tapped and what the screen did.`;
  }
  return null;
}

/** The one-line order fact: reference first, because that is what the desk searches by. */
export function bugReportOrderLine(order: BugReportOrder): string {
  const reference = orderReference(order.id) ?? order.id;
  const state = orderStateMeta(order).label;
  const title = order.title?.trim();
  return title ? `${reference}, ${title} (${state})` : `${reference} (${state})`;
}

/** The chat message Operations receives. */
export function composeBugReport(
  draft: BugReportDraft,
  device: BugReportDevice,
  order?: BugReportOrder | null,
): string {
  const expected = draft.expected.trim();
  const lines = [
    BUG_REPORT_HEADING,
    "",
    "What happened:",
    draft.happened.trim(),
  ];
  if (expected) lines.push("", "What I expected:", expected);
  lines.push("");
  if (order) lines.push(`Order: ${bugReportOrderLine(order)}`);
  lines.push(`App: ${device.app}`);
  if (device.phone) lines.push(`Phone: ${device.phone}`);
  lines.push(`System: ${device.system}`);
  return lines.join("\n");
}

type PlatformFacts = {
  OS: string;
  Version: string | number;
  constants: {
    Brand?: string;
    Manufacturer?: string;
    Model?: string;
    Release?: string;
    systemName?: string;
    osVersion?: string;
    interfaceIdiom?: string;
  };
};

/**
 * Brand, model and OS release — never the serial or build fingerprint, which
 * Android also exposes and which identify the handset rather than describe it.
 */
export function describeDevice(
  platform: PlatformFacts,
  appVersion: string | null | undefined,
  environment?: string | null,
): BugReportDevice {
  const version = appVersion?.trim() || "unknown version";
  const app =
    environment === ExecutionEnvironment.StoreClient
      ? `GRIDGO Client ${version} (Expo Go)`
      : `GRIDGO Client ${version}`;
  const c = platform.constants ?? {};

  if (platform.OS === "android") {
    const maker = titleCase(c.Brand || c.Manufacturer || "");
    const model = c.Model?.trim() ?? "";
    // Some makers already lead the model with the brand ("Redmi Note 12").
    const phone =
      maker && !model.toLowerCase().startsWith(maker.toLowerCase())
        ? `${maker} ${model}`.trim()
        : model || maker;
    const release = c.Release || String(platform.Version);
    return { app, phone: phone || null, system: `Android ${release}` };
  }

  if (platform.OS === "ios") {
    const idiom = c.interfaceIdiom === "pad" ? "iPad" : c.interfaceIdiom === "phone" ? "iPhone" : null;
    const name = c.systemName || "iOS";
    return { app, phone: idiom, system: `${name} ${c.osVersion || platform.Version}` };
  }

  return { app, phone: null, system: platform.OS === "web" ? "Web browser" : platform.OS };
}

/** This phone, now. */
export function currentDevice(): BugReportDevice {
  return describeDevice(
    Platform as unknown as PlatformFacts,
    Constants.expoConfig?.version,
    Constants.executionEnvironment,
  );
}

/** Most recently touched orders first, so the job in trouble is near the top. */
export function recentOrdersForReport<T extends Pick<Order, "updatedAt" | "createdAt">>(
  orders: readonly T[],
  max = ORDER_CHOICES_MAX,
): T[] {
  return [...orders]
    .sort((a, b) => stamp(b) - stamp(a))
    .slice(0, max);
}

function stamp(order: Pick<Order, "updatedAt" | "createdAt">): number {
  const at = Date.parse(order.updatedAt || order.createdAt);
  return Number.isNaN(at) ? 0 : at;
}

function titleCase(value: string): string {
  const trimmed = value.trim();
  return trimmed ? trimmed[0].toUpperCase() + trimmed.slice(1) : "";
}
