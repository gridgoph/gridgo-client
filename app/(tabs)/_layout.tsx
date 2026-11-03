import { Tabs } from "expo-router";
import { useEffect } from "react";

import { GridgoTabBar } from "@/components/GridgoTabBar";
import { ACTION_TAB, TABS } from "@/constants/tabs";
import { useThemeColors } from "@/hooks/useTheme";
import { useIsApprovedOrganization, useOrganization } from "@/store/organization";
import { useSession } from "@/store/session";

/**
 * The client tab shell.
 *
 * The bar is four destinations, and a fifth — Organizations — for an
 * approved organization account, with the raised yellow "+" in the centre
 * (client#335). The "+" opens the quick-actions sheet; its "Start a new
 * print" keeps the old landings (`lib/startPrint.ts`): the category screen
 * with nothing chosen, checkout for a basket, the stepper for a draft.
 *
 * The stepper stays a tab route so a draft can reopen it, but `href: null`
 * keeps it out of the bar.
 */
export default function TabsLayout() {
  const colors = useThemeColors();
  const approvedOrganization = useIsApprovedOrganization();
  const userId = useSession((s) => s.user?.id ?? null);
  const accountType = useSession((s) => s.user?.accountType ?? null);

  // The officer record decides the tab during a handover, so an organization
  // account reads it once per sign-in. Nobody else is asked.
  useEffect(() => {
    if (userId && accountType === "organization") void useOrganization.getState().load();
  }, [userId, accountType]);

  return (
    <Tabs
      tabBar={(props) => <GridgoTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: colors.canvas },
        /*
          Tabs are places, not steps: opening one is an instant swap under
          chrome that never moves. The library already defaults to this, but a
          default is not a decision — stated here, a future upgrade or a stray
          `shift` cannot quietly turn a destination into a transition.
        */
        animation: "none",
      }}
    >
      {TABS.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: tab.label,
            // Organizations exists for approved organizations only (#160).
            href:
              tab.name === ACTION_TAB || (tab.name === "organizations" && !approvedOrganization)
                ? null
                : undefined,
          }}
        />
      ))}
    </Tabs>
  );
}
