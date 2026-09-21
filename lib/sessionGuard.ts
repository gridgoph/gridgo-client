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
  "design-system",
  "settings",
  "saved-places",
  "saved-place",
] as const;

/** Only reachable while signed out (mirror of the signed-in set). */
export const SIGNED_OUT_ROOT_SCREENS = ["(auth)/login"] as const;

/** True when the client session has a signed-in user. */
export function hasActiveSession(user: unknown): boolean {
  return user != null;
}
