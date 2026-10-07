import { ChevronRight, MessageCircle } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";

import { useThemeColors } from "@/hooks/useTheme";
import { deliveryChatEntry, type DeliveryChatSummary } from "@/lib/deliveryChat";

/**
 * The way into the conversation with the rider. The tracking card carries it
 * while the rider has the job; after delivery it sits with the order's help
 * rows, saying when the messages go.
 */
export function DeliveryChatRow({
  chat,
  onPress,
}: {
  chat: DeliveryChatSummary;
  onPress: () => void;
}) {
  const colors = useThemeColors();
  const entry = deliveryChatEntry(chat);
  const open = chat.status === "open";

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={entry.accessibilityLabel}
      accessibilityHint={entry.detail}
      className="gg-touch flex-row items-center gap-3 py-2"
      style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
    >
      {/* Live, it leads with a filled mark; delivered, it matches the help rows beside it. */}
      {open ? (
        <View
          className="h-10 w-10 items-center justify-center rounded-pill"
          style={{ backgroundColor: colors.accent }}
        >
          <MessageCircle size={18} color={colors.accentOn} strokeWidth={2} aria-hidden />
        </View>
      ) : (
        <MessageCircle size={20} color={colors.textSecondary} strokeWidth={2} aria-hidden />
      )}
      <View className="flex-1">
        <Text className="text-body font-medium text-text-primary">{entry.title}</Text>
        <Text className="text-caption text-text-muted">{entry.detail}</Text>
      </View>
      <ChevronRight size={18} color={colors.textMuted} strokeWidth={2} aria-hidden />
    </Pressable>
  );
}
