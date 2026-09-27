import { ExternalLink, Link2 } from "lucide-react-native";
import { Linking, Pressable, Text, View } from "react-native";

import { useThemeColors } from "@/hooks/useTheme";
import type { ArtworkLink } from "@/lib/api";
import { linkDisplay, linkLabel } from "@/lib/designLink";

/**
 * A design link saved with an order, as a row that opens it.
 *
 * The address is shown, middle-truncated, because two Canva links look alike
 * by name and differ only in the id at the end.
 */
export function DesignLinkRow({ link }: { link: ArtworkLink }) {
  const colors = useThemeColors();
  const label = linkLabel(link);

  return (
    <Pressable
      onPress={() => void Linking.openURL(link.url).catch(() => undefined)}
      accessibilityRole="link"
      accessibilityLabel={`${label}: ${linkDisplay(link.url)}. Opens outside GRIDGO.`}
      className="gg-touch flex-row items-center gap-3 border-b border-outline-subtle py-3"
      style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
    >
      <Link2 size={16} color={colors.textSecondary} strokeWidth={2} aria-hidden />
      <View className="min-w-0 flex-1">
        <Text className="text-body text-text-secondary">{label}</Text>
        <Text className="text-caption text-text-primary" numberOfLines={1} ellipsizeMode="middle">
          {linkDisplay(link.url)}
        </Text>
      </View>
      <ExternalLink size={16} color={colors.textMuted} strokeWidth={2} aria-hidden />
    </Pressable>
  );
}
