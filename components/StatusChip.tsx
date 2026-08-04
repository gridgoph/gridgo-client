import Feather from "@expo/vector-icons/Feather";
import { Text, View } from "react-native";

import { useThemeColors } from "@/hooks/useTheme";

/** Maps to the semantic colour tokens. `neutral` carries no signal. */
export type StatusTone = "success" | "warning" | "error" | "info" | "neutral";

type Props = {
  tone: StatusTone;
  /** Say the state: "Approved", "Blocked", "Updated 3 min ago". */
  label: string;
  icon: keyof typeof Feather.glyphMap;
};

/**
 * Colour never carries meaning alone. A status is always icon + label +
 * colour, so the screen stays readable in grayscale and to a screen reader.
 */
const TONE = {
  success: { border: "border-success", text: "text-success", token: "success" },
  warning: { border: "border-warning", text: "text-warning", token: "warning" },
  error: { border: "border-error", text: "text-error", token: "error" },
  info: { border: "border-info", text: "text-info", token: "info" },
  neutral: { border: "border-outline", text: "text-text-secondary", token: "textSecondary" },
} as const;

export function StatusChip({ tone, label, icon }: Props) {
  const colors = useThemeColors();
  const style = TONE[tone];

  return (
    <View className={`gg-chip ${style.border}`} accessibilityRole="text">
      <Feather name={icon} size={13} color={colors[style.token]} />
      <Text className={`text-caption ${style.text}`}>{label}</Text>
    </View>
  );
}
