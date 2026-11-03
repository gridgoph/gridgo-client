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

export type TabName =
  | "home"
  | "orders"
  | "organizations"
  | "new-request"
  | "notifications"
  | "account";

export type TabDefinition = {
  /** Route file in `app/(tabs)`, without the extension. */
  name: TabName;
  /** Tab bar label. */
  label: string;
  /**
   * The bar tab that reads as open while this route is open, for a route kept
   * out of the bar. Organizations lives under Account, so Account lights.
   */
  parent?: TabName;
};

export const TABS: readonly TabDefinition[] = [
  { name: "home", label: "Home" },
  { name: "orders", label: "Orders" },
  { name: "organizations", label: "Organizations", parent: "account" },
  { name: "notifications", label: "Alerts" },
  { name: "account", label: "Account" },
  { name: "new-request", label: "New request" },
];

/**
 * The stepper. It stays a tab route so a draft can reopen it, but it is not
 * in the bar — the bar's centre "+" opens the quick actions instead.
 *
 * Typed as the literal, not `TabName`. `Exclude<TabName, typeof ACTION_TAB>`
 * must stay the four labelled destinations; annotating this as `TabName`
 * collapses that Exclude to `never` and fails `npx tsc` on the bar.
 */
export const ACTION_TAB = "new-request" satisfies TabName;


/**
 * Routes that stay tab routes but are never in the bar.
 *
 * Organizations moved into Account (Mark's option 5): with it in the bar, an
 * approved organization had five tabs and the centre "+" landed third of six.
 * The route stays where it was, so `/(tabs)/organizations`, the inbox and a
 * push still open it; Account is the way in from the screen.
 */
export const OFF_BAR_TABS: readonly TabName[] = [ACTION_TAB, "organizations"];

/** The four destinations the bar draws: Home, Orders, Alerts, Account. */
export type BarTabName = Exclude<TabName, typeof ACTION_TAB | "organizations">;

export function isBarTab(name: TabName): name is BarTabName {
  return !OFF_BAR_TABS.includes(name);
}
