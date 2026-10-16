import { Phone } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";

import { useThemeColors } from "@/hooks/useTheme";
import { useCall } from "@/store/call";

/**
 * Call the rider, beside the way to message them.
 *
 * Shown only while the call window is open — the same window in which the
 * conversation is writable — so the caller decides that, not this button.
 * While a call on this order is already live it brings that call back rather
 * than starting a second one.
 */
export function CallRiderButton({ orderId }: { orderId: string }) {
  const colors = useThemeColors();
  const live = useCall((s) => s.session != null && s.session.orderId === orderId && s.session.phase !== "ended");

  return (
    <Pressable
      onPress={() => {
        if (live) useCall.getState().expand();
        else void useCall.getState().startCall(orderId);
      }}
      accessibilityRole="button"
      accessibilityLabel={live ? "Return to the call with your rider" : "Call your rider"}
      accessibilityHint={live ? undefined : "Calls go over the internet. Your phone number stays private."}
      className="gg-touch items-center gap-1 py-1 pl-2"
      style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
    >
      <View
        className="h-11 w-11 items-center justify-center rounded-pill"
        style={{ backgroundColor: live ? colors.success : colors.accent }}
      >
        <Phone size={18} color={colors.accentOn} strokeWidth={2} aria-hidden />
      </View>
      <Text className="text-caption font-medium text-text-primary">{live ? "On call" : "Call"}</Text>
    </Pressable>
  );
}
