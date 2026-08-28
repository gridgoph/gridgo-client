import { Plus } from "lucide-react-native";
import { Platform, Pressable, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  START_PRINT_FAB_INSET_RIGHT,
  TAB_BAR_METRICS,
  startPrintFabBottom,
} from "@/components/GridgoTabBar";
import { useThemeColors } from "@/hooks/useTheme";
import { startPrintHref } from "@/lib/startPrint";

/**
 * The yellow "+" that starts a print request.
 *
 * It used to live in the middle of the tab bar, which spent the screen's one
 * yellow on chrome and clipped the last card. It sits on the bottom-right of
 * every main tab now — still the only yellow on the screen, still the same
 * three landings, and the tab bar is four destinations again.
 */
export function StartPrintFab() {
  const router = useRouter();
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const size = TAB_BAR_METRICS.actionDiameter;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Start a print request"
      onPress={() => router.push(startPrintHref())}
      style={{
        position: "absolute",
        right: START_PRINT_FAB_INSET_RIGHT + insets.right,
        bottom: startPrintFabBottom(insets.bottom),
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: colors.actionYellow,
        alignItems: "center",
        justifyContent: "center",
        zIndex: 20,
        ...Platform.select({
          ios: {
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.28,
            shadowRadius: 6,
          },
          default: { elevation: 6 },
        }),
      }}
    >
      {({ pressed }) => (
        <>
          <Plus size={26} color={colors.actionYellowOn} strokeWidth={2.5} />
          {pressed ? (
            <View pointerEvents="none" className="gg-pressed absolute inset-0 rounded-pill" />
          ) : null}
        </>
      )}
    </Pressable>
  );
}
