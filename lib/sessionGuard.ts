/**
 * Session → route contract for the root stack.
 *
 * Expo Router `Stack.Protected` (SDK 54) reads the live session and excludes
 * these screens from the navigator when the guard is false. Declaring the
 * screen names here keeps the layout and the regression test in lockstep so a
 * future refactor cannot silently drop the signed-in area guard.
 *
 * `order/[id]`, `design-system`, and `settings` sit outside `(tabs)` on the
 * root stack — a tabs-only guard would leave those screens open after sign-out.
 */

export const AUTHENTICATED_ROOT_SCREENS = [
  "(tabs)",
  "order/[id]",
  "order/receipt",
  "order/physical-invoice",
  "order/refund",
  "order/refund-request",
  "order/refund-account",
  "order/delivery-chat",
  "design-system",
  "settings",
  "whats-new",
  "saved-places",
  "saved-place",
  "vouchers",
] as const;

/**
 * Signed in, and open even while terms wait to be agreed: the documents, the
 * client's privacy requests and account deletion never wait behind the
 * agreement checkbox (`docs/LEGAL_API.md`).
 */
export const LEGAL_OPEN_ROOT_SCREENS = [
  "legal/index",
  "privacy/index",
  "privacy/request",
  "delete-account",
] as const;

/** Only while terms wait to be agreed: the agreement screen itself. */
export const LEGAL_GATE_ROOT_SCREENS = ["legal/review"] as const;

/** Only reachable while signed out (mirror of the signed-in set). */
export const SIGNED_OUT_ROOT_SCREENS = ["(auth)/login"] as const;

/** True when the client session has a signed-in user. */
export function hasActiveSession(user: unknown): boolean {
  return user != null;
}
