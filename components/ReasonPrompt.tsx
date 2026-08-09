import { useEffect, useState } from "react";
import { Modal, Pressable, Text, TextInput, View } from "react-native";

import { useReducedMotion } from "@/hooks/useReducedMotion";
import { useThemeColors } from "@/hooks/useTheme";

type Props = {
  visible: boolean;
  title: string;
  /** Why this reason matters and who reads it. */
  body: string;
  label: string;
  placeholder: string;
  submitLabel: string;
  /** Shortest usable answer, so a one-word reason is caught here. */
  minLength?: number;
  busy?: boolean;
  error?: string | null;
  onSubmit: (reason: string) => void;
  onCancel: () => void;
};

/**
 * Asks for the reason behind a decision that costs someone else work.
 *
 * Requesting changes to a proof sends a supplier back to the press, so the
 * reason is required and the screen says who will read it.
 */
export function ReasonPrompt({
  visible,
  title,
  body,
  label,
  placeholder,
  submitLabel,
  minLength = 10,
  busy,
  error,
  onSubmit,
  onCancel,
}: Props) {
  const colors = useThemeColors();
  const reducedMotion = useReducedMotion();
  const [text, setText] = useState("");

  useEffect(() => {
    if (visible) setText("");
  }, [visible]);

  const trimmed = text.trim();
  const tooShort = trimmed.length < minLength;

  return (
    <Modal
      visible={visible}
      transparent
      animationType={reducedMotion ? "none" : "fade"}
      onRequestClose={onCancel}
    >
      <View className="flex-1 justify-center bg-scrim px-6">
        <View className="gap-4 rounded-card border border-outline bg-surface p-5">
          <Text className="text-h3 text-text-primary">{title}</Text>
          <Text className="text-body text-text-secondary">{body}</Text>

          <View className="gap-2">
            <Text className="text-caption text-text-muted">{label}</Text>
            <TextInput
              className="gg-field h-auto min-h-24 py-3"
              value={text}
              onChangeText={setText}
              placeholder={placeholder}
              placeholderTextColor={colors.textMuted}
              multiline
              textAlignVertical="top"
              maxLength={500}
              accessibilityLabel={label}
            />
            {error ? (
              <Text className="text-caption text-error">{error}</Text>
            ) : tooShort ? (
              <Text className="text-caption text-text-muted">
                At least {minLength} characters — name what is wrong and where.
              </Text>
            ) : null}
          </View>

          <View className="gap-3 pt-1">
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: tooShort || Boolean(busy) }}
              disabled={tooShort || busy}
              onPress={() => onSubmit(trimmed)}
              className={
                tooShort || busy ? "gg-btn-primary gg-disabled" : "gg-btn-primary"
              }
            >
              <Text className="text-button text-action-yellow-on">
                {busy ? "Sending…" : submitLabel}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={onCancel}
              className={busy ? "gg-btn-secondary gg-disabled" : "gg-btn-secondary"}
            >
              <Text className="text-button text-text-primary">Cancel</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
