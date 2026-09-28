/**
 * One order goes to one shop.
 *
 * gridgo-api refuses a basket line from a second shop with
 * `409 cart_belongs_to_another_shop` (`src/order-match-routes.js`): a basket
 * spanning two shops needs two of everything downstream, and none of that is
 * wired. So when GRIDGO matches the next product to a different shop than the
 * one already holding the basket, the product needs an order of its own.
 *
 * That refusal is a rule, not a failure. Read as an unmapped error it fell
 * through to "Check your connection", and a client with a working connection
 * was left retrying a tap that could never succeed (issue report B057A39C).
 * This module is the one place that tells the rule apart and words it — the
 * listing sheet draws it, and never names or counts the shops involved.
 */

import { ApiError, type CartLineRecord } from "@/lib/api";
import { lineName } from "@/lib/basket";

export const OTHER_SHOP_CODE = "cart_belongs_to_another_shop";

/** GRIDGO refused this line because the basket is already with another shop. */
export function isOtherShopRefusal(error: unknown): boolean {
  if (!(error instanceof ApiError) || error.status !== 409) return false;
  const body = error.body;
  return (
    typeof body === "object" &&
    body !== null &&
    "error" in body &&
    (body as { error: unknown }).error === OTHER_SHOP_CODE
  );
}

/**
 * The basket's contents as a phrase: "Flyers", "Flyers and Stickers",
 * "Flyers, Stickers and 2 more". Named from the listings, never from the shop.
 */
export function basketContentsPhrase(lines: CartLineRecord[]): string {
  const names = lines.map(lineName);
  if (names.length === 0) return "other items";
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names[0]}, ${names[1]} and ${names.length - 2} more`;
}

export const OTHER_SHOP_TITLE = "This needs an order of its own";

/** Why the product cannot join the basket, and what the two ways on are. */
export function otherShopExplanation(lines: CartLineRecord[]): string {
  return (
    `Your order already has ${basketContentsPhrase(lines)}, and GRIDGO matched this ` +
    "to a different shop. One order goes to one shop, so check out your order first, " +
    "or start a new order with this."
  );
}

/**
 * The confirmation before the basket is replaced. It says exactly what goes,
 * because the removed lines and the artwork on them cannot be brought back.
 */
export function startOverConfirmation(lines: CartLineRecord[]): {
  question: string;
  body: string;
} {
  const count = lines.length;
  const what = count === 0 ? "everything in your order" : `${basketContentsPhrase(lines)} from your order`;
  const artwork = count === 1 ? "any artwork you added to it" : "any artwork you added to them";
  return {
    question: "Start a new order with this?",
    body: `This removes ${what}, along with ${artwork}. It cannot be undone.`,
  };
}
