import { Platform } from "react-native";

import { PushedStackHeader } from "@/components/PushedStackHeader";
import { HeaderThemeButton } from "@/components/HeaderThemeButton";

/**
 * Header options for screens pushed above the tab shell.
 *
 * **1. The back control is the bare chevron.**
 * On iOS, the native stack labels the back control with the previous screen's
 * title. The tab group route is the filesystem name `(tabs)`, which must never
 * reach the user. Order (and similar) can also be opened from more than one
 * tab, so a single origin label would be a lie.
 *
 * `headerBackButtonDisplayMode: "minimal"` solves both: it renders the chevron
 * alone, so no origin title — least of all `(tabs)` — can ever appear there.
 * This file briefly set `headerBackTitle: "Back"` instead, after riders
 * reported missing the bare chevron; the captain has since overruled that and
 * asked for the chevron. Keep `minimal` — dropping it does not merely change
 * the wording, it hands the label back to the previous screen's title.
 *
 * Android uses the React Navigation Header's platform back arrow.
 *
 * **2. The band always carries a title.**
 * A pushed screen costs a full header bar — 44pt on iOS, 56dp on Android, on
 * top of the status inset — whether or not anything is written in it. With
 * `title: ""` the client got that bar containing a back chevron and otherwise
 * nothing, sitting above the screen's own large heading: the space was spent
 * and bought nothing. Hiding the header instead would reclaim almost none of
 * it, because an in-content back control needs a 44pt row of its own; so the
 * band stays and earns its keep by naming where the client is.
 *
 * **3. Android edge-to-edge applies the status inset once.**
 * PushedStackHeader owns the Android inset; see its local layout invariant.
 * Keep it paired with androidEdgeToEdgeHeaderOptions on pushed routes and
 * spread those options onto the root Stack. The flag alone does not install
 * the replacement header. iOS keeps its native header.
 *
 * Android also supplies HeaderThemeButton through headerRight so the control
 * belongs to the title row, outside the screen's scrolling content.
 *
 * The title is a required argument rather than a spread-in default so the
 * omission cannot happen again: `pushedScreenOptions("")` does not compile,
 * and an all-whitespace title throws at startup.
 * Pick a title that does not repeat the screen's own heading. A headerless
 * predecessor still needs a title for a pushed child's back-control fallback.
 * lib/__tests__/pushedRouteLayout.test.ts renders the root layout to check
 * effective header options for reachable signed-in and signed-out routes.
 */

/**
 * Shared native-stack status-bar configuration. The Android header replacement
 * is installed separately by pushedScreenOptions; see the contract above.
 */
export const androidEdgeToEdgeHeaderOptions = {
  statusBarTranslucent: true,
} as const;

/** A string literal type that rejects the empty string at compile time. */
type NonEmptyTitle<T extends string> = T extends "" ? never : T;

export function pushedScreenOptions<T extends string>(title: NonEmptyTitle<T>) {
  if (!title.trim()) {
    throw new Error(
      "A pushed screen needs a header title: the band is drawn either way, so an " +
        "empty one is space the client pays for and cannot read.",
    );
  }

  return {
    title,
    headerBackButtonDisplayMode: "minimal" as const,
    ...androidEdgeToEdgeHeaderOptions,
    header: Platform.OS === "android" ? PushedStackHeader : undefined,
    headerRight: Platform.OS === "android" ? HeaderThemeButton : undefined,
  };
}
