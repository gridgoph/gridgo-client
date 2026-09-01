import type { ReactNode } from "react";
import { LayoutGrid, List } from "lucide-react-native";
import { Pressable, View } from "react-native";

import type { CategoryView } from "@/hooks/useCategoryView";
import { useThemeColors } from "@/hooks/useTheme";

type Props = {
  view: CategoryView;
  onViewChange: (view: CategoryView) => void;
};

/**
 * Wall or list. Same two-button control the shop's board uses, without the
 * yellow plus — a client is choosing a sample, not putting one up.
 */
export function CategoryViewToggle({ view, onViewChange }: Props) {
  const colors = useThemeColors();

  return (
    <View
      className="flex-row rounded-field border border-outline bg-surface-variant p-1"
      accessibilityRole="radiogroup"
      accessibilityLabel="How to show samples"
    >
      <ViewButton
        selected={view === "wall"}
        label="Show as a wall"
        onPress={() => onViewChange("wall")}
      >
        <LayoutGrid
          size={18}
          color={view === "wall" ? colors.textPrimary : colors.textMuted}
          strokeWidth={2}
        />
      </ViewButton>
      <ViewButton
        selected={view === "list"}
        label="Show as a list"
        onPress={() => onViewChange("list")}
      >
        <List
          size={18}
          color={view === "list" ? colors.textPrimary : colors.textMuted}
          strokeWidth={2}
        />
      </ViewButton>
    </View>
  );
}

function ViewButton({
  selected,
  label,
  onPress,
  children,
}: {
  selected: boolean;
  label: string;
  onPress: () => void;
  children: ReactNode;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      className={
        selected
          ? "h-11 w-11 items-center justify-center rounded-sm border border-outline bg-surface-high"
          : "h-11 w-11 items-center justify-center rounded-sm"
      }
      style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
    >
      {children}
    </Pressable>
  );
}
