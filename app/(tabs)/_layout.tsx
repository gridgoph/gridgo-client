import { Tabs, useRouter } from "expo-router";

import { GridgoTabBar } from "@/components/GridgoTabBar";
import { ACTION_TAB, TABS } from "@/constants/tabs";
import { useThemeColors } from "@/hooks/useTheme";
import { useRequestDraft } from "@/store/requestDraft";

/**
 * The client tab shell.
 *
 * The bar is drawn from the tokens on every platform — see `GridgoTabBar`.
 * Headers are off here because the tabs do not share one: Home carries a role
 * header, New Request carries the stepper.
 *
 * The yellow "+" is the app's single "start a print request" control, so it has
 * to land where a request actually starts. With nothing chosen yet that is the
 * category screen, not an empty stepper — a client should never meet a form
 * before they have said what they are printing. With a request already in
 * progress it goes back to that one, which is what "+" means to someone who
 * left mid-draft.
 */
export default function TabsLayout() {
  const colors = useThemeColors();
  const router = useRouter();

  return (
    <Tabs
      tabBar={(props) => <GridgoTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: colors.canvas },
      }}
    >
      {TABS.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{ title: tab.label }}
          listeners={
            tab.name === ACTION_TAB
              ? {
                  tabPress: (event) => {
                    if (useRequestDraft.getState().productId) return;
                    event.preventDefault();
                    router.push("/request/category");
                  },
                }
              : undefined
          }
        />
      ))}
    </Tabs>
  );
}
