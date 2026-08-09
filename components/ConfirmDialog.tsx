import { Modal, Pressable, Text, View } from "react-native";

import { useReducedMotion } from "@/hooks/useReducedMotion";

type Props = {
  visible: boolean;
  /** The specific question — never "Are you sure?". */
  question: string;
  /** What happens, and what cannot be taken back. */
  body: string;
  /** The verb, matching the button that opened this. */
  confirmLabel: string;
  cancelLabel?: string;
  /** `destructive` for anything that removes work or cannot be undone. */
  tone?: "primary" | "destructive";
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

/**
 * Confirmation for an action that cannot be taken back.
 *
 * The question names the thing and the consequence, so a client can answer it
 * without re-reading the screen behind the dialog.
 */
export function ConfirmDialog({
  visible,
  question,
  body,
  confirmLabel,
  cancelLabel = "Cancel",
  tone = "primary",
  busy,
  onConfirm,
  onCancel,
}: Props) {
  const reducedMotion = useReducedMotion();

  return (
    <Modal
      visible={visible}
      transparent
      animationType={reducedMotion ? "none" : "fade"}
      onRequestClose={onCancel}
    >
      <View className="flex-1 justify-center bg-scrim px-6">
        <View className="gap-4 rounded-card border border-outline bg-surface p-5">
          <Text className="text-h3 text-text-primary">{question}</Text>
          <Text className="text-body text-text-secondary">{body}</Text>
          <View className="gap-3 pt-1">
            {tone === "destructive" ? (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled: Boolean(busy) }}
                disabled={busy}
                onPress={onConfirm}
                className={
                  busy
                    ? "gg-btn-secondary gg-disabled border-error"
                    : "gg-btn-secondary border-error"
                }
              >
                <Text className="text-button text-error">{confirmLabel}</Text>
              </Pressable>
            ) : (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled: Boolean(busy) }}
                disabled={busy}
                onPress={onConfirm}
                className={busy ? "gg-btn-primary gg-disabled" : "gg-btn-primary"}
              >
                <Text className="text-button text-action-yellow-on">{confirmLabel}</Text>
              </Pressable>
            )}
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={onCancel}
              className={busy ? "gg-btn-secondary gg-disabled" : "gg-btn-secondary"}
            >
              <Text className="text-button text-text-primary">{cancelLabel}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
