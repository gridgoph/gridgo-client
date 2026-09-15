import { Check, Trash2 } from "lucide-react-native";
import { ActivityIndicator, Image, Pressable, Text, View } from "react-native";
import { useThemeColors } from "@/hooks/useTheme";
import type { usePaymentProof } from "@/hooks/usePaymentProof";

/**
 * The receipt screenshot.
 *
 * Checkout will not take the order without it, so it is asked for here rather
 * than after the button refuses. Progress is honest: the bar filling means the
 * bytes left the phone, and only a file id back from GRIDGO is a tick.
 */
export function PaymentProofRow({
  state,
  disabled = false,
  reading,
  error,
  onPick,
  onView,
  onReset,
}: {
  state: ReturnType<typeof usePaymentProof>["state"];
  reading: boolean;
  disabled?: boolean;
  error: string | null;
  onPick: () => void;
  onView: () => void;
  onReset: () => void;
}) {
  const colors = useThemeColors();
  const sending = state.phase === "sending";
  const stored = state.phase === "stored";

  return (
    <View className={error ? "gg-card gap-3 border-error" : "gg-card gap-3"}>
      <View className="flex-row items-center justify-between gap-3">
        <Text className="min-w-0 flex-1 text-body-lg font-medium text-text-primary">
          Payment screenshot
        </Text>
        {reading ? (
          <View className="flex-row items-center gap-2">
            <ActivityIndicator size="small" color={colors.textMuted} />
            <Text className="text-caption text-text-muted">Reading…</Text>
          </View>
        ) : stored ? (
          <View className="gg-chip">
            <Check size={13} color={colors.success} strokeWidth={2.5} />
            <Text className="text-caption text-text-secondary">Uploaded</Text>
          </View>
        ) : null}
      </View>

      {stored && state.localUri ? (
        <Pressable
          onPress={onView}
          accessibilityRole="button"
          accessibilityLabel="Open the payment screenshot"
        >
          <Image
            source={{ uri: state.localUri }}
            accessibilityLabel="Payment screenshot preview"
            resizeMode="cover"
            style={{ height: 160, width: "100%", borderRadius: 8 }}
          />
        </Pressable>
      ) : null}

      <Text
        className={
          error || state.phase === "failed" ? "text-caption text-error" : "text-caption text-text-muted"
        }
      >
        {error
          ? error
          : state.phase === "empty"
          ? "The screenshot of your QR transfer, so Operations can match it."
          : state.phase === "sending"
            ? state.progress == null
              ? "Sending your screenshot…"
              : `Sending your screenshot — ${Math.round(state.progress * 100)}%.`
            : stored
              ? "Tap the picture to view it."
              : (state.error ?? "That screenshot did not reach GRIDGO.")}
      </Text>

      <View className="flex-row gap-2">
        <Pressable
          onPress={onPick}
          disabled={sending || disabled}
          accessibilityRole="button"
          accessibilityLabel={
            state.phase === "stored" ? "Choose a different screenshot" : "Add the screenshot"
          }
          accessibilityState={{ disabled: sending || disabled }}
          className={sending || disabled ? "gg-btn-secondary gg-disabled flex-1" : "gg-btn-secondary flex-1"}
          style={({ pressed }) => (pressed && !sending && !disabled ? { opacity: 0.85 } : undefined)}
        >
          <Text className="text-button text-text-primary">
            {state.phase === "stored" ? "Choose another" : "Add screenshot"}
          </Text>
        </Pressable>
        {stored && state.localUri ? (
          <Pressable
            onPress={onView}
            accessibilityRole="button"
            accessibilityLabel="View the payment screenshot"
            className="gg-btn-secondary px-4"
            style={({ pressed }) => (pressed ? { opacity: 0.85 } : undefined)}
          >
            <Text className="text-button text-text-primary">View</Text>
          </Pressable>
        ) : null}
        {stored ? (
          <Pressable
            onPress={onReset}
            disabled={disabled}
            accessibilityState={{ disabled }}
            accessibilityRole="button"
            accessibilityLabel="Remove the screenshot"
            className="gg-btn-secondary px-4"
            style={({ pressed }) => (pressed ? { opacity: 0.85 } : undefined)}
          >
            <Trash2 size={16} color={colors.textMuted} strokeWidth={2} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

