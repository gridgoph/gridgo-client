/**
 * "Add more from Shop A": what that shop group can still take (report
 * C86B13A1, gridgo-api#244, `docs/ORDER_MATCH_API.md#add-more-from-a-cart-group`).
 *
 * The control used to open the category picker, so a client guessed what the
 * shop behind Shop A prints and, more often than not, guessed something it
 * does not — and met an error. GRIDGO now lists the group's own orderable
 * products, already filtered to the group's date, as anonymous GRIDGO
 * listings. Nothing here, and nothing the read returns, says whose they are.
 *
 * The list issues no pick tokens. Choosing a card asks GRIDGO for a match held
 * to the group (`groupId`), and the card is found again in that answer by its
 * id — never "the first listing" — so the token on the line is for exactly
 * what the client tapped, on the group's shop and date.
 */

import type { CartGroupEmptyReason, MatchInput, MatchResult } from "@/lib/api";
import { groupDateLabel } from "@/lib/basketGroups";
import type { PickableListing } from "@/lib/match";

/** The one line under every way out of an empty group. */
const ANOTHER_SHOP =
  "You can still add something from another shop. It joins your order as its own group, with its own delivery fee.";

/** What an empty group says, in place of an empty list or an error. */
export function groupListingsEmpty(
  reason: CartGroupEmptyReason | null,
  label: string,
  deadline: string | null,
): { title: string; body: string } {
  if (reason === "deadline_not_met") {
    return {
      title: `Nothing more fits ${groupDateLabel(deadline)}`,
      body: `No more products can be added to ${label} for this date. ${ANOTHER_SHOP}`,
    };
  }
  return {
    title: `Nothing more to add from ${label}`,
    body: `No products are currently available to add from ${label}. ${ANOTHER_SHOP}`,
  };
}

/**
 * The match a tapped card is picked through: held to the group's shop, and
 * with no `deadline`, so GRIDGO keeps the group's own date (the API's rule).
 * Fulfilment is added by the caller, the same way every match adds it.
 */
export function groupPickInput(
  cartId: string,
  groupId: string,
  subcategoryCode: string,
): Pick<MatchInput, "subcategoryCode" | "cartId" | "groupId"> {
  return { subcategoryCode, cartId, groupId };
}

/**
 * The tapped card in the group's match, with the token that picks it. Null
 * when GRIDGO no longer offers it to this group (its queue or date moved since
 * the list was read): the screen then reads the list again rather than
 * substituting another product.
 */
export function pickedFromGroupMatch(
  match: Pick<MatchResult, "listings" | "otherListings">,
  listingId: string,
): PickableListing | null {
  const found = [...match.listings, ...(match.otherListings ?? [])].find(
    (listing) => listing.id === listingId,
  );
  return found?.selectToken ? found : null;
}

/** Said when the tapped product dropped out between the list and the tap. */
export function groupPickGone(name: string, label: string): string {
  return `${name} can no longer join ${label} for this date. The list is up to date now. Choose another product.`;
}
