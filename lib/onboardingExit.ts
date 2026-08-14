/**
 * Explicit onboarding exit targets.
 *
 * First launch and Settings replay must not share "whatever is on the stack".
 * Call sites pass an entry point (`returnTo`); this module maps it to a
 * dismiss action. History-only `canGoBack` is only used for the default path.
 */

export type OnboardingDismissTarget =
  | { type: "replace"; href: "/settings" }
  | { type: "replace"; href: "/(tabs)/home" }
  | { type: "replace"; href: "/" }
  | { type: "back" };

/**
 * Resolve where finish / skip should send the user.
 *
 * - `returnTo=settings` → Settings (replay from Account → Settings).
 * - `returnTo=home` → Home after first-launch (Google / profile complete).
 * - Otherwise prefer `back` when there is a previous screen, else launcher `/`.
 */
export function resolveOnboardingDismissTarget(
  returnTo: string | string[] | undefined,
  canGoBack: boolean,
): OnboardingDismissTarget {
  const value = Array.isArray(returnTo) ? returnTo[0] : returnTo;
  if (value === "settings") {
    return { type: "replace", href: "/settings" };
  }
  if (value === "home") {
    return { type: "replace", href: "/(tabs)/home" };
  }
  if (canGoBack) return { type: "back" };
  return { type: "replace", href: "/" };
}
