import { Info } from "lucide-react-native";
import { Text, View } from "react-native";

import { useThemeColors } from "@/hooks/useTheme";

/**
 * "Why we ask", in one line beside the field or the camera it explains.
 *
 * Said where the data is given, not in a policy nobody opens: a phone number,
 * an address, a photo. The purpose is specific to that capture — "to route
 * your delivery", never "to improve our services".
 */
export function WhyWeAsk({ children }: { children: string }) {
  const colors = useThemeColors();
  return (
    <View
      className="flex-row items-start gap-2"
      accessible
      accessibilityLabel={`Why we ask: ${children}`}
    >
      <Info size={14} color={colors.textMuted} style={{ marginTop: 2 }} aria-hidden />
      <Text className="min-w-0 flex-1 text-caption text-text-muted">{children}</Text>
    </View>
  );
}
