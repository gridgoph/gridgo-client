import { Tabs } from "expo-router";

import { GridgoTabBar } from "@/components/GridgoTabBar";
import { ACTION_TAB, TABS } from "@/constants/tabs";
import { useThemeColors } from "@/hooks/useTheme";

/**
 * The client tab shell.
 *
 * The bar is four destinations. The yellow "+" floats on each of those
 * screens (`StartPrintFab`) and is the one start-a-print-request control.
 * With nothing chosen yet that is the category screen, not an empty stepper —
 * a client should never meet a form before they have said what they are
 * printing. With work already in progress it goes back to that: a basket
 * goes to checkout, and an older stepper draft opens the stepper.
 *
 * The stepper stays a tab route so a draft can reopen it, but `href: null`
 * keeps it out of the bar.
 */
export default function TabsLayout() {
  const colors = useThemeColors();

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
            href: tab.name === ACTION_TAB ? null : undefined,
          }}
        />
      ))}
    </Tabs>
  );
}
