import { Zap } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";

import { HOME_TILE_MIN_HEIGHT, HomeTileSlots } from "@/components/HomeTileSlots";
import { useThemeColors } from "@/hooks/useTheme";

type Props = {
  onPress: () => void;
  onIntrinsicHeight?: (height: number) => void;
  minHeight?: number;
};

/**
 * Home's bottom-right tile (gridgo-client#441): Express documents, one tap
 * to the Files step. It took Reorder's place — Reorder lives on the Orders
 * tab and in the "+" sheet. Yellow by the captain's call: on Home it is the
 * one way to print a document now.
 */
export function HomeExpressTile({ onPress, onIntrinsicHeight, minHeight }: Props) {
  const colors = useThemeColors();
  const floor = Math.max(HOME_TILE_MIN_HEIGHT, minHeight ?? 0);
  return (
    <Pressable
      testID="express-tile"
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Express. Print your docs now"
      className="w-full grow overflow-hidden rounded-card bg-action-yellow p-3"
      style={{ minHeight: floor, minWidth: 0, borderWidth: 1, borderColor: colors.actionYellow }}
    >
      {({ pressed }) => (
        <>
          <HomeTileSlots
            onIntrinsicHeight={onIntrinsicHeight}
            top={
              <View
                className="h-8 w-8 items-center justify-center rounded-pill"
                style={{ backgroundColor: colors.actionYellowOn }}
              >
                <Zap size={16} color={colors.actionYellow} fill={colors.actionYellow} strokeWidth={2} />
              </View>
            }
            title={
              <Text className="text-body-lg font-bold text-action-yellow-on">
                Print your docs now
              </Text>
            }
            subtitle={
              <Text className="text-caption font-bold text-action-yellow-on" style={{ lineHeight: 18 }}>
                Skip the line →
              </Text>
            }
          />
          {pressed ? <View pointerEvents="none" className="gg-pressed absolute inset-0" /> : null}
        </>
      )}
    </Pressable>
  );
}
