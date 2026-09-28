import { ChevronDown } from "lucide-react-native";
import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";

import { useReducedMotion } from "@/hooks/useReducedMotion";
import { useThemeColors } from "@/hooks/useTheme";
import type { OrderSectionKey } from "@/lib/orderSections";
import { useOrderSections } from "@/store/orderSections";

type Props = {
  section: OrderSectionKey;
  title: string;
  /** The one fact the section holds, said while it is folded. */
  summary: string;
  /** Every section after the first on a board is closed off by a hairline. */
  divided?: boolean;
  children: ReactNode;
};

/**
 * One folding section of the order screen's board (gridgo-client#129).
 *
 * The heading is a real button that announces whether it is expanded, and it
 * keeps its summary line open or folded, so the fact under it never moves.
 * Whether it is open is remembered per section (`store/orderSections.ts`).
 */
export function FoldSection({ section, title, summary, divided = false, children }: Props) {
  const colors = useThemeColors();
  const reducedMotion = useReducedMotion();
  const open = useOrderSections((state) => state.open[section]);
  const toggle = useOrderSections((state) => state.toggle);

  return (
    <View className={divided ? "border-t border-outline-subtle" : undefined}>
      <Pressable
        onPress={() => toggle(section)}
        accessibilityRole="button"
        accessibilityLabel={`${title}. ${summary}`}
        accessibilityState={{ expanded: open }}
        accessibilityHint={open ? `Folds ${title.toLowerCase()} away` : `Shows ${title.toLowerCase()}`}
        className="gg-touch flex-row items-center gap-3 px-4 py-3.5"
        style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
      >
        <View className="min-w-0 flex-1 gap-0.5">
          <Text className="text-body-lg font-medium text-text-primary">{title}</Text>
          <Text className="text-caption text-text-muted" numberOfLines={1}>
            {summary}
          </Text>
        </View>
        <View style={open ? { transform: [{ rotate: "180deg" }] } : undefined}>
          <ChevronDown size={20} color={colors.textSecondary} strokeWidth={2} aria-hidden />
        </View>
      </Pressable>
      {open ? (
        <Animated.View
          entering={reducedMotion ? undefined : FadeIn.duration(180)}
          className="px-4 pb-4"
        >
          {children}
        </Animated.View>
      ) : null}
    </View>
  );
}
