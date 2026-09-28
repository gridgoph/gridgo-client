import { Split } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";

import { useThemeColors } from "@/hooks/useTheme";
import { OTHER_SHOP_TITLE } from "@/lib/otherShop";

type Props = {
  /** `otherShopExplanation` for the basket as it stands. */
  explanation: string;
  busy: boolean;
  onCheckout: () => void;
  onStartOver: () => void;
};

/**
 * A product GRIDGO matched to a different shop from the basket's.
 *
 * It takes the place of "Add to my order" in the listing sheet's commit bar,
 * because that tap can no longer succeed and a button that refuses every time
 * is a dead end. What it offers instead are the two ways on that exist today:
 * finish the basket that is there, or replace it with this.
 *
 * Checking out is the yellow one — it loses nothing, and it is the screen's one
 * commitment now that adding is off the table. Starting over removes work, so
 * it is the neutral button, and it only asks (`ConfirmDialog`, destructive).
 *
 * Informational tone, not error: nothing failed. The disc is the same soft
 * mark Home's docket uses, and the headline says the same thing in words.
 */
export function OtherShopNotice({ explanation, busy, onCheckout, onStartOver }: Props) {
  const colors = useThemeColors();

  return (
    <View testID="other-shop-notice" className="mt-3 gap-3">
      <View
        accessible
        accessibilityRole="alert"
        accessibilityLabel={`${OTHER_SHOP_TITLE}. ${explanation}`}
        className="flex-row items-start gap-3"
      >
        <View aria-hidden className="h-10 w-10 shrink-0 items-center justify-center rounded-pill">
          <View
            pointerEvents="none"
            className="absolute inset-0 rounded-pill"
            style={{ backgroundColor: colors.info, opacity: 0.14 }}
          />
          <Split size={19} color={colors.info} strokeWidth={2} />
        </View>
        <View className="min-w-0 flex-1 gap-1">
          <Text className="text-body font-bold text-text-primary">{OTHER_SHOP_TITLE}</Text>
          <Text className="text-caption text-text-secondary">{explanation}</Text>
        </View>
      </View>

      <Pressable
        onPress={onCheckout}
        disabled={busy}
        accessibilityRole="button"
        accessibilityLabel="Check out my order"
        accessibilityState={{ disabled: busy }}
        className={busy ? "gg-btn-primary gg-disabled" : "gg-btn-primary"}
        style={({ pressed }) => (pressed && !busy ? { opacity: 0.9 } : undefined)}
      >
        <Text className="text-button text-action-yellow-on">Check out my order</Text>
      </Pressable>
      <Pressable
        onPress={onStartOver}
        disabled={busy}
        accessibilityRole="button"
        accessibilityLabel="Start a new order with this"
        accessibilityState={{ disabled: busy }}
        className={busy ? "gg-btn-secondary gg-disabled" : "gg-btn-secondary"}
        style={({ pressed }) => (pressed && !busy ? { opacity: 0.8 } : undefined)}
      >
        <Text className="text-button text-text-primary">
          {busy ? "Starting a new order…" : "Start a new order with this"}
        </Text>
      </Pressable>
    </View>
  );
}
