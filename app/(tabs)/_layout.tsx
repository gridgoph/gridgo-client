import { Tabs, useRouter } from "expo-router";
import { useEffect } from "react";

import { GridgoTabBar } from "@/components/GridgoTabBar";
import { isBarTab, TABS } from "@/constants/tabs";
import { useMembershipMatches } from "@/hooks/useMembershipMatches";
import { useThemeColors } from "@/hooks/useTheme";
import { useOrganization } from "@/store/organization";
import { usePendingGroupInvite } from "@/store/pendingGroupInvite";
import { usePendingJoin } from "@/store/pendingJoin";
import { useSession } from "@/store/session";

/**
 * The client tab shell.
 *
 * The bar is four destinations — Home, Orders, Alerts, Account — with the
 * raised yellow "+" in the centre (client#335). Organizations stays a tab
 * route, out of the bar: an approved organization opens it from Account.
 * The "+" opens the quick-actions sheet; its "Start a new print" lands on
 * checkout for a basket, else the category screen (`lib/startPrint.ts`).
 *
 * The retired request form stays a route with nothing leading to it, and
 * Organizations keeps every link that reaches it; `href: null` keeps both out
 * of the bar.
 */
export default function TabsLayout() {
  const colors = useThemeColors();
  const userId = useSession((s) => s.user?.id ?? null);
  const accountType = useSession((s) => s.user?.accountType ?? null);

  // The officer record decides Account's Organizations entry during a
  // handover, so an organization account reads it once per sign-in. Nobody
  // else is asked.
  useEffect(() => {
    if (userId && accountType === "organization") void useOrganization.getState().load();
  }, [userId, accountType]);

  // A group invite that opened the app before sign-in opens once the shell is up.
  const router = useRouter();
  const pendingInvite = usePendingGroupInvite((s) => s.token);
  useEffect(() => {
    if (!userId || !pendingInvite) return;
    const frame = requestAnimationFrame(() => {
      // The join screen may already have opened it from the link itself.
      if (usePendingGroupInvite.getState().token !== pendingInvite) return;
      usePendingGroupInvite.getState().clear();
      router.push({ pathname: "/express/group/join/[token]", params: { token: pendingInvite } });
    });
    return () => cancelAnimationFrame(frame);
  }, [userId, pendingInvite, router]);

  // So does a member link: a new student scans the QR first and signs up second.
  const pendingJoin = usePendingJoin((s) => s.token);
  useEffect(() => {
    if (!userId || !pendingJoin) return;
    const frame = requestAnimationFrame(() => {
      if (usePendingJoin.getState().token !== pendingJoin) return;
      usePendingJoin.getState().clear();
      router.push({ pathname: "/join/[token]", params: { token: pendingJoin } });
    });
    return () => cancelAnimationFrame(frame);
  }, [userId, pendingJoin, router]);

  useMembershipMatches();

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
            href: isBarTab(tab.name) ? undefined : null,
          }}
        />
      ))}
    </Tabs>
  );
}
