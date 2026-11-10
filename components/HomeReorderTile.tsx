import { RefreshCw } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";

import { HOME_TILE_HEIGHT } from "@/components/HomeSmartTile";
import { HomeTileSlots } from "@/components/HomeTileSlots";
import { useThemeColors } from "@/hooks/useTheme";

type Props = {
  /** The job a tap reorders, or null when there is none yet. */
  title: string | null;
  onPress: () => void;
};

/**
 * Home's bottom-right tile: the client's last print, one tap from a request
 * already filled in. With nothing to reorder it stays in place, disabled, and
 * says why — a tile that vanishes moves everything beside it.
 */
export function HomeReorderTile({ title, onPress }: Props) {
  const colors = useThemeColors();
  const disabled = !title;
  return (
    <Pressable
      testID="reorder-tile"
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={disabled ? "Reorder. No past print yet" : `Reorder ${title}`}
      accessibilityState={{ disabled }}
      className="flex-1 rounded-card border border-outline bg-surface-variant p-3"
      style={({ pressed }) => [{ height: HOME_TILE_HEIGHT, minWidth: 0, flexBasis: 0 }, pressed ? { opacity: 0.75 } : null]}
    >
      <HomeTileSlots
        top={
          <View className={disabled ? "h-8 w-8 items-center justify-center rounded-pill bg-surface-high gg-disabled" : "h-8 w-8 items-center justify-center rounded-pill bg-surface-high"}>
            <RefreshCw size={16} color={colors.textPrimary} strokeWidth={2} />
          </View>
        }
        title={<Text className={disabled ? "text-h3 text-text-muted" : "text-h3 text-text-primary"}>Reorder</Text>}
        subtitle={
          <Text className="text-caption text-text-secondary" numberOfLines={1}>
            {disabled ? "No past print yet" : title}
          </Text>
        }
      />
    </Pressable>
  );
}
