import type { ReactNode } from "react";
import { Text, View } from "react-native";

import { useThemeColors } from "@/hooks/useTheme";

/**
 * One message in an order conversation — the rider's and the print shop's
 * alike. The client's own sit right on the accent; everyone else's sit left
 * on a bordered surface, with who wrote it and when underneath.
 */
export function OrderChatBubble({
  mine,
  body,
  attachments,
  caption,
  children,
}: {
  mine: boolean;
  /** Empty when an attachment is the whole message. */
  body: string;
  attachments?: ReactNode[];
  caption: string;
  /** Under the caption: a note about the message, or what to do with it. */
  children?: ReactNode;
}) {
  const colors = useThemeColors();
  return (
    <View className={mine ? "max-w-[80%] items-end self-end" : "max-w-[80%] items-start self-start"}>
      <View
        className="rounded-card px-3 py-2"
        style={{
          backgroundColor: mine ? colors.accent : colors.surface,
          borderWidth: mine ? 0 : 1,
          borderColor: colors.outline,
        }}
      >
        {body ? (
          <Text className="text-body" style={{ color: mine ? colors.accentOn : colors.textPrimary }}>
            {body}
          </Text>
        ) : null}
        {attachments?.map((attachment, index) => (
          <View key={index} className={body || index > 0 ? "mt-2" : undefined}>
            {attachment}
          </View>
        ))}
      </View>
      <Text className="mt-1 text-caption text-text-muted">{caption}</Text>
      {children}
    </View>
  );
}
