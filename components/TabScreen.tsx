import type { ReactNode } from "react";

import { Screen } from "@/components/Screen";

/**
 * A main tab: canvas and status-bar inset.
 *
 * Home, Orders, Notifications and Account all open through this. The yellow
 * "+" lives in the centre of the tab bar now (client#335), not on each
 * screen, so it can never drift onto one tab and off another.
 */
export function TabScreen({ children }: { children: ReactNode }) {
  return <Screen edges={["top"]}>{children}</Screen>;
}
