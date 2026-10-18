/**
 * Deleting a saved address (gridgoph/gridgo-client#308), as the client reads it.
 *
 * Contract: `DELETE /me/addresses/:id` in gridgo-api `docs/ORDER_MATCH_API.md`.
 * A delete only takes the address off the list: orders, baskets and receipts
 * carry their own copy of where they were going, so nothing already placed
 * moves. Deleting the default leaves no default — GRIDGO picks no replacement,
 * and the app has no way to set one yet, so it says so and the next delivery
 * step asks where the job is going, as it always does.
 */

import type { ClientAddress } from "@/lib/api";

export function deleteQuestion(address: ClientAddress): string {
  return `Delete ${address.label}?`;
}

export function deleteBody(address: ClientAddress): string {
  const base =
    "It comes off your saved addresses. Orders you already placed keep the address they were placed with.";
  return address.isDefault
    ? `${base} It is your default, so no default will be set until you choose one at your next delivery.`
    : base;
}

export const DELETE_CONFIRM_LABEL = "Delete address";

export const DELETE_FAILED = "GRIDGO could not delete that address. Try again in a moment.";

/** What the screen says once the address is gone. */
export function deletedNotice(address: ClientAddress, defaultCleared: boolean, remaining: number): string {
  if (remaining === 0) return `${address.label} deleted. You have no saved addresses now.`;
  if (defaultCleared) {
    return `${address.label} deleted. No default address is set now, so GRIDGO will ask where to deliver on your next order.`;
  }
  return `${address.label} deleted.`;
}

/** The list minus what was deleted here and not yet re-read from GRIDGO. */
export function withoutRemoved<T extends { id: string }>(addresses: T[], removed: readonly string[]): T[] {
  return removed.length ? addresses.filter((address) => !removed.includes(address.id)) : addresses;
}
