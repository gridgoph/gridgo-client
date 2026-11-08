import { cartIsOpen, useCart } from "@/store/cart";

/**
 * Where the yellow "+" takes a client.
 *
 * A basket with something in it opens checkout; otherwise GRIDGO asks what they
 * are printing. A remembered basket that is empty or already paid is no basket
 * (`cartIsOpen`).
 */
export type StartPrintHref = "/checkout" | "/request/category";

export function startPrintHref(): StartPrintHref {
  return cartIsOpen(useCart.getState()) ? "/checkout" : "/request/category";
}
