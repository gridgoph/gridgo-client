import { ChevronRight, Store } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";

import { useThemeColors } from "@/hooks/useTheme";
import { shopChatEntry, unreadShopChatNoticeIds, type ShopChatSummary } from "@/lib/shopChat";
import { useNotifications } from "@/store/notifications";

/**
 * The way into the masked conversation with the print shop, with the order's
 * help rows. Open, it leads with a filled mark like the live rider chat; closed,
 * it matches the rows beside it. A new message is a dot and a line of words,
 * from the inbox notice it arrived with — reading the conversation itself
 * marks it read, so it is never fetched just to count.
 */
export function ShopChatRow({
  orderId,
  chat,
  onPress,
}: {
  orderId: string;
  chat: ShopChatSummary;
  onPress: () => void;
}) {
  const colors = useThemeColors();
  const unread = useNotifications((state) => unreadShopChatNoticeIds(state.items, state.readIds, orderId).length > 0);
  const entry = shopChatEntry(chat, unread);
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
      {open ? (
        <View
          className="h-10 w-10 items-center justify-center rounded-pill"
          style={{ backgroundColor: colors.accent }}
        >
          <Store size={18} color={colors.accentOn} strokeWidth={2} aria-hidden />
        </View>
      ) : (
        <Store size={20} color={colors.textSecondary} strokeWidth={2} aria-hidden />
      )}
      <View className="flex-1">
        <Text className="text-body font-medium text-text-primary">{entry.title}</Text>
        <View className="flex-row items-center gap-1.5">
          {unread ? (
            <View className="h-2 w-2 rounded-pill" style={{ backgroundColor: colors.info }} aria-hidden />
          ) : null}
          <Text className={unread ? "flex-1 text-caption font-medium text-text-primary" : "flex-1 text-caption text-text-muted"}>
            {entry.detail}
          </Text>
        </View>
      </View>
      <ChevronRight size={18} color={colors.textMuted} strokeWidth={2} aria-hidden />
    </Pressable>
  );
}
