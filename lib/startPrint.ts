import { useCart } from "@/store/cart";
import { useRequestDraft } from "@/store/requestDraft";

/**
 * Where the yellow "+" takes a client.
 *
 * One control, three honest landings: a basket already started opens checkout,
 * a stepper already started opens that stepper, and otherwise GRIDGO asks
 * what they are printing before it shows a form.
 */
export type StartPrintHref = "/checkout" | "/(tabs)/new-request" | "/request/category";

export function startPrintHref(): StartPrintHref {
  if (useCart.getState().cartId) return "/checkout";
  if (useRequestDraft.getState().productId) return "/(tabs)/new-request";
  return "/request/category";
}
