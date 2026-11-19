/**
 * What an Express order says after Place order (gridgo-client#443; gridgo-api
 * `docs/EXPRESS_API.md#states-shop-actions-and-five-minute-timer`). The
 * server's `expressOrder.status` decides; this only turns it into one hero,
 * a four-stop rail and the one thing the client can do.
 */

import type { ExpressEvent, ExpressOrder, Order } from "@/lib/api";

export type ExpressPhase =
  | "checking"
  | "sending"
  | "moved"
  | "accepted"
  | "printing"
  | "ready"
  | "on_the_way"
  | "done"
  | "cancelled";

export type ExpressView = {
  phase: ExpressPhase;
  title: string;
  line: string;
  /** 0 Sent, 1 Printing, 2 Ready, 3 Picked up / Delivered. Null when cancelled. */
  railIndex: number | null;
  /** Free cancellation holds until a shop accepts. */
  cancellable: boolean;
};

export const RAIL_LABELS = (pickup: boolean) => ["Sent", "Printing", "Ready", pickup ? "Picked up" : "Delivered"];

/** The newest event that is not the plain "sending" restart. */
function lastTurn(events: ExpressEvent[]): ExpressEvent | null {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    if (events[index].state !== "sending") return events[index];
  }
  return null;
}

export function expressView(order: Pick<Order, "fulfillmentMode" | "expressOrder">, shopName: string | null): ExpressView {
  const express = order.expressOrder as ExpressOrder;
  const pickup = order.fulfillmentMode !== "delivery";
  const shop = shopName ?? "the shop";
  const turn = lastTurn(express.events ?? []);
  switch (express.status) {
    case "sending": {
      if (turn?.state === "moved") {
        return {
          phase: "moved",
          title: `Moved to ${shop}`,
          line: "The first shop could not take it. Same price.",
          railIndex: 0,
          cancellable: true,
        };
      }
      if (!express.acceptBy) {
        return {
          phase: "checking",
          title: "Checking your order",
          line: "GRIDGO checks your payment and files, then sends it.",
          railIndex: 0,
          cancellable: true,
        };
      }
      return { phase: "sending", title: `Sending to ${shop}…`, line: "Waiting for the shop to accept.", railIndex: 0, cancellable: true };
    }
    case "accepted":
      return { phase: "accepted", title: `${capitalise(shop)} accepted`, line: "Printing starts soon.", railIndex: 1, cancellable: false };
    case "printing":
      return { phase: "printing", title: "Printing", line: `${capitalise(shop)} is printing your files.`, railIndex: 1, cancellable: false };
    case "ready":
      return pickup
        ? { phase: "ready", title: "Ready!", line: `Show this code at ${shop}.`, railIndex: 2, cancellable: false }
        : { phase: "on_the_way", title: "On its way", line: "A rider is bringing your print.", railIndex: 2, cancellable: false };
    case "picked_up":
    case "delivered":
      return {
        phase: "done",
        title: pickup ? "Picked up" : "Delivered",
        line: "Thanks for printing with GRIDGO.",
        railIndex: 3,
        cancellable: false,
      };
    case "cancelled":
      return {
        phase: "cancelled",
        title: "Cancelled",
        line: (express.declineCount ?? 0) >= 3 || turn?.state === "cancelled" && turn.reason
          ? "No shop could take it this time."
          : "This order was cancelled.",
        railIndex: null,
        cancellable: false,
      };
    default:
      return { phase: "checking", title: "Order placed", line: "GRIDGO is working on it.", railIndex: 0, cancellable: false };
  }
}

function capitalise(text: string): string {
  return text ? text[0].toUpperCase() + text.slice(1) : text;
}

/** "4:32" left for the shop to accept; null once the deadline passed or there is none. */
export function acceptCountdown(acceptBy: string | null | undefined, now: number): string | null {
  if (!acceptBy) return null;
  const left = Date.parse(acceptBy) - now;
  if (!Number.isFinite(left) || left <= 0) return null;
  const seconds = Math.ceil(left / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/** "482 913": two groups of three, leading zeroes kept. */
export function formatPickupCode(code: string | null | undefined): string | null {
  if (!code || !/^\d{6}$/.test(code)) return null;
  return `${code.slice(0, 3)} ${code.slice(3)}`;
}

/** OpenStreetMap directions to the shop; no map SDK and no key. */
export function directionsUrl(point: { lat: number; lng: number }): string {
  return `https://www.openstreetmap.org/directions?route=%3B${point.lat}%2C${point.lng}`;
}

export const GOOD_TAGS = ["Fast", "Clear print", "Friendly", "Good value"];
export const BAD_TAGS = ["Slow", "Faded print", "Wrong settings", "Hard to find"];

/** Tags the stars invite: praise at four and five, what went wrong below. */
export function ratingTags(stars: number): string[] {
  return stars >= 4 ? GOOD_TAGS : BAD_TAGS;
}

/** The review body: one overall score, with tags carried in the comment. */
export function ratingBody(stars: number, tags: string[]): {
  qualityStars: number;
  speedStars: number;
  valueStars: number;
  comment?: string;
} {
  const score = Math.min(5, Math.max(1, Math.round(stars)));
  const picked = tags.filter((tag) => ratingTags(score).includes(tag));
  return {
    qualityStars: score,
    speedStars: score,
    valueStars: score,
    ...(picked.length ? { comment: `Tags: ${picked.join(", ")}` } : {}),
  };
}
