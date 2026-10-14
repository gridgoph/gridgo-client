import { Check, Copy } from "lucide-react-native";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";

import { useThemeColors } from "@/hooks/useTheme";
import { copyText } from "@/lib/copyText";
import { groupedCode } from "@/lib/vouchers";

/**
 * The code, grouped in fours and selectable, with a Copy control that says
 * it worked. GRIDGO puts the voucher in the wallet and on checkout on its
 * own; the code is for typing it in somewhere the wallet is not to hand.
 */
export function VoucherCodeRow({ code }: { code: string }) {
  const colors = useThemeColors();
  const [copied, setCopied] = useState<"yes" | "no" | null>(null);
  return (
    <View className="gap-1">
      <View className="flex-row items-center gap-3 rounded-field bg-surface-variant py-1 pl-4 pr-1">
        <View className="min-w-0 flex-1">
          <Text className="text-caption text-text-muted">Voucher code</Text>
          <Text
            selectable
            className="text-body-lg font-bold text-text-primary"
            style={{ fontVariant: ["tabular-nums"], letterSpacing: 1 }}
            accessibilityLabel={`Voucher code ${code.split("").join(" ")}`}
          >
            {groupedCode(code)}
          </Text>
        </View>
        <Pressable
          onPress={() => void copyText(code).then((ok) => setCopied(ok ? "yes" : "no"))}
          accessibilityRole="button"
          accessibilityLabel={copied === "yes" ? "Code copied" : "Copy the voucher code"}
          className="gg-btn-secondary"
          style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
        >
          {copied === "yes" ? (
            <Check size={16} color={colors.success} strokeWidth={2.5} aria-hidden />
          ) : (
            <Copy size={16} color={colors.textPrimary} strokeWidth={2} aria-hidden />
          )}
          <Text className="text-button text-text-primary">{copied === "yes" ? "Copied" : "Copy"}</Text>
        </Pressable>
      </View>
      {copied === "no" ? (
        <Text className="text-caption text-text-muted" accessibilityRole="alert">
          Could not copy on this phone. Press and hold the code to copy it.
        </Text>
      ) : null}
    </View>
  );
}
