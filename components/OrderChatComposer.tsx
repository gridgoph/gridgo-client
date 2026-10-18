import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { Send, X, type LucideIcon } from "lucide-react-native";

import { TextField } from "@/components/form/TextField";
import { useThemeColors } from "@/hooks/useTheme";

/**
 * The bottom of an order conversation: what is waiting to go, then attach,
 * the message and send. Shared by the rider chat and the print shop chat so
 * the two read as one product.
 */
export function OrderChatComposer({
  draft,
  onChangeDraft,
  onSend,
  onAttach,
  sending,
  maxLength,
  placeholder,
  fieldLabel,
  attachIcon: AttachIcon,
  attachLabel,
  pendingSummary,
  clearPendingLabel,
  onClearPending,
  pendingNote,
}: {
  draft: string;
  onChangeDraft: (text: string) => void;
  onSend: () => void;
  onAttach: () => void;
  sending: boolean;
  maxLength: number;
  placeholder: string;
  fieldLabel: string;
  attachIcon: LucideIcon;
  attachLabel: string;
  /** What is attached and not yet sent, or null when nothing is. */
  pendingSummary: string | null;
  clearPendingLabel: string;
  onClearPending: () => void;
  /** Who will see the attachments, said while there are some. */
  pendingNote?: ReactNode;
}) {
  const colors = useThemeColors();
  const canSend = !sending && Boolean(draft.trim() || pendingSummary);

  return (
    <>
      {pendingSummary ? (
        <View className="flex-row items-center gap-2">
          <Text className="min-w-0 flex-1 text-caption text-text-muted" numberOfLines={1}>
            {pendingSummary}
          </Text>
          <Pressable
            onPress={onClearPending}
            disabled={sending}
            accessibilityRole="button"
            accessibilityLabel={clearPendingLabel}
            className="gg-touch h-11 w-11 items-center justify-center"
          >
            <X size={16} color={colors.textMuted} strokeWidth={2} aria-hidden />
          </Pressable>
        </View>
      ) : null}
      {pendingSummary ? pendingNote : null}

      <View className="flex-row items-end gap-2">
        <Pressable
          onPress={onAttach}
          disabled={sending}
          accessibilityRole="button"
          accessibilityLabel={attachLabel}
          accessibilityState={{ disabled: sending }}
          className="gg-touch h-12 w-12 items-center justify-center rounded-field"
          style={{ borderWidth: 1, borderColor: colors.outline, opacity: sending ? 0.38 : 1 }}
        >
          <AttachIcon size={18} color={colors.textPrimary} strokeWidth={2} aria-hidden />
        </Pressable>
        <View className="min-w-0 flex-1">
          <TextField
            value={draft}
            onChangeText={onChangeDraft}
            placeholder={placeholder}
            accessibilityLabel={fieldLabel}
            multiline
            maxLength={maxLength}
            multilineMinHeight={48}
            editable={!sending}
            returnKeyType="send"
            onSubmitEditing={onSend}
          />
        </View>
        <Pressable
          onPress={onSend}
          disabled={!canSend}
          accessibilityRole="button"
          accessibilityLabel="Send"
          accessibilityState={{ disabled: !canSend }}
          className="gg-touch h-12 w-12 items-center justify-center rounded-field bg-accent"
          style={{ opacity: canSend ? 1 : 0.38 }}
        >
          <Send size={18} color={colors.accentOn} strokeWidth={2} aria-hidden />
        </Pressable>
      </View>
    </>
  );
}
