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
  { name: "new-request", label: "New Request" },
  { name: "notifications", label: "Notifications" },
  { name: "account", label: "Account" },
];

/** The middle tab is an action, not a destination, and both bars promote it. */
export const ACTION_TAB: TabName = "new-request";
