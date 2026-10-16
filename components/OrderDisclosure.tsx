import { ChevronDown, type LucideIcon } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";

import { useThemeColors } from "@/hooks/useTheme";

type Props = {
  title: string;
  /** What is behind it, said while it is folded so nobody has to open it to find out. */
  summary: string;
  icon: LucideIcon;
  open: boolean;
  onToggle: () => void;
};

/**
 * A heading that opens what the received order screen keeps folded:
 * "Get help?" and "View details" (report 5A28D524).
 *
 * The heading is a real button that announces whether it is expanded; what it
 * opens is drawn by the screen straight under it, so the cards and rows in
 * there keep their own shapes rather than being nested in a second card.
 * The summary wraps rather than truncates: at large text a cut-off line hides
 * the very thing it is there to say.
 */
export function OrderDisclosure({ title, summary, icon: Icon, open, onToggle }: Props) {
  const colors = useThemeColors();
  const name = title.replace(/\?$/, "").toLowerCase();

  return (
    <Pressable
      onPress={onToggle}
      accessibilityRole="button"
      accessibilityLabel={`${title}${/[?.!]$/.test(title) ? "" : "."} ${summary}`}
      accessibilityState={{ expanded: open }}
      accessibilityHint={open ? `Folds ${name} away` : `Shows ${name}`}
      className="gg-card-flush gg-touch flex-row items-center gap-3 px-4 py-3.5"
      style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
    >
      <Icon size={20} color={colors.textSecondary} strokeWidth={2} aria-hidden />
      <View className="min-w-0 flex-1 gap-0.5">
        <Text className="text-body-lg font-medium text-text-primary">{title}</Text>
        <Text className="text-caption text-text-muted">{summary}</Text>
      </View>
      <View style={open ? { transform: [{ rotate: "180deg" }] } : undefined}>
        <ChevronDown size={20} color={colors.textSecondary} strokeWidth={2} aria-hidden />
      </View>
    </Pressable>
  );
}
