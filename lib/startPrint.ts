import { cartIsOpen, useCart } from "@/store/cart";
import { useRequestDraft } from "@/store/requestDraft";

/**
 * Where the yellow "+" takes a client.
 *
 * One control, three honest landings: a basket with something in it opens
 * checkout, a stepper already started opens that stepper, and otherwise GRIDGO
 * asks what they are printing before it shows a form. A remembered basket that
 * is empty or already paid is no basket (`cartIsOpen`).
 */
export type StartPrintHref = "/checkout" | "/(tabs)/new-request" | "/request/category";

export function startPrintHref(): StartPrintHref {
  if (cartIsOpen(useCart.getState())) return "/checkout";
  if (useRequestDraft.getState().productId) return "/(tabs)/new-request";
  return "/request/category";
}
