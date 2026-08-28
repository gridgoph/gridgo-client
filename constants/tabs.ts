/**
 * The client tab bar.
 *
 * Order, route name and label live here once. Two tab bars consume it — the
 * native one iOS gets, and the drawn one everywhere else — and this is what
 * stops them drifting apart.
 *
 * Icons deliberately stay out of this file. SF Symbols are an iOS vocabulary
 * and Lucide is ours; neither translates into the other, so each tab bar
 * keeps its own map, typed against `TabName` so a new tab cannot be added
 * here without both maps being updated.
 */

export type TabName = "home" | "orders" | "new-request" | "notifications" | "account";

export type TabDefinition = {
  /** Route file in `app/(tabs)`, without the extension. */
  name: TabName;
  /** Tab bar label. */
  label: string;
};

export const TABS: readonly TabDefinition[] = [
  { name: "home", label: "Home" },
  { name: "orders", label: "Orders" },
  { name: "notifications", label: "Notifications" },
  { name: "account", label: "Account" },
  { name: "new-request", label: "New request" },
];

/**
 * The stepper. It stays a tab route so a draft can reopen it, but it is not
 * in the bar — the yellow "+" on each main screen is the way into a request.
 *
 * Typed as the literal, not `TabName`. `Exclude<TabName, typeof ACTION_TAB>`
 * must stay the four labelled destinations; annotating this as `TabName`
 * collapses that Exclude to `never` and fails `npx tsc` on the bar.
 */
export const ACTION_TAB = "new-request" satisfies TabName;
