import { Info, TriangleAlert } from "lucide-react-native";
import { Text, View } from "react-native";

import { useThemeColors } from "@/hooks/useTheme";

/** A toned line: icon, title and body, so colour never carries it alone. */
export function HandoverNotice({
  tone,
  title,
  body,
}: {
  tone: "info" | "warning";
  title: string;
  body: string;
}) {
  const colors = useThemeColors();
  const Icon = tone === "warning" ? TriangleAlert : Info;
  return (
    <View
      accessible
      className={
        tone === "warning"
          ? "flex-row items-start gap-3 rounded-card border border-warning bg-surface p-3"
          : "flex-row items-start gap-3 rounded-card border border-info bg-surface p-3"
      }
    >
      <Icon size={18} color={tone === "warning" ? colors.warning : colors.info} strokeWidth={2} aria-hidden />
      <View className="min-w-0 flex-1 gap-0.5">
        <Text className="text-body font-medium text-text-primary">{title}</Text>
        <Text className="text-body text-text-secondary">{body}</Text>
      </View>
    </View>
  );
}
