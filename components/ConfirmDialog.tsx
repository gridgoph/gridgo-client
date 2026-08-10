import { useEffect } from "react";
import { Modal, Pressable, Text, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";

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
 * A centred dialog, not a sheet — it asks one question and takes an answer, and
 * both platforms put that in the middle of the screen rather than at the bottom.
 * The question names the thing and the consequence, so a client can answer it
 * without re-reading the screen behind it.
 *
 * The scrim dismisses a routine confirmation but **not** a destructive one: an
 * accidental tap beside the dialog must not be how work gets discarded. Android
 * back still cancels either, because the platform owns that gesture.
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
  const progress = useSharedValue(0);

  useEffect(() => {
    if (!visible) {
      progress.value = 0;
      return;
    }
    progress.value = reducedMotion
      ? withTiming(1, { duration: 200 })
      : withSpring(1, { damping: 26, stiffness: 380, mass: 0.8 });
  }, [visible, reducedMotion, progress]);

  // Reduced motion keeps the fade and drops the scale — the dialog still
  // arrives, it just does not move.
  const cardStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: reducedMotion
      ? []
      : [{ scale: 0.94 + progress.value * 0.06 }],
  }));

  const dismissable = tone !== "destructive" && !busy;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View className="flex-1 justify-center bg-scrim px-6">
        {dismissable ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={cancelLabel}
            onPress={onCancel}
            style={ABSOLUTE_FILL}
          />
        ) : null}

        <Animated.View
          accessibilityViewIsModal
          className="gap-4 rounded-card border border-outline bg-surface p-5"
          style={cardStyle}
        >
          <Text className="text-h3 text-text-primary" accessibilityRole="header">
            {question}
          </Text>
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
        </Animated.View>
      </View>
    </Modal>
  );
}

const ABSOLUTE_FILL = {
  position: "absolute",
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
} as const;
