import type { ReactNode } from "react";

import { Screen } from "@/components/Screen";
import { StartPrintFab } from "@/components/StartPrintFab";

/**
 * A main tab: canvas, status-bar inset, and the yellow "+" on the bottom right.
 *
 * Home, Orders, Notifications and Account all open through this so the plus
 * cannot drift onto one screen and off another, and so the stepper — which is
 * already a request in progress — never grows a second one.
 */
export function TabScreen({ children }: { children: ReactNode }) {
  return (
    <Screen edges={["top"]}>
      {children}
      <StartPrintFab />
    </Screen>
  );
}
