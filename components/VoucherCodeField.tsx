import { CircleAlert, CircleCheck } from "lucide-react-native";
import { useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";

import { TextField } from "@/components/form/TextField";
import { useThemeColors } from "@/hooks/useTheme";
import { useServerNow } from "@/hooks/useVoucherClock";
import { shortTime } from "@/lib/vouchers";
import { useVouchers } from "@/store/vouchers";

/**
 * "Add code": one field and one button, with the answer said right under it.
 *
 * The answer lives in the voucher store, not here, so it survives the async
 * round trip (see AGENTS.md on dropped state updates) and the wallet and
 * checkout say the same words. After five codes that did not work GRIDGO
 * locks entry for 15 minutes; the field says until when and stays shut until
 * then, rather than taking guesses that would only be refused.
 */
export function VoucherCodeField({
  onSubmit,
  label = "Add a voucher code",
}: {
  /** Sends the code; resolves true when it worked, so the field can clear. */
  onSubmit: (code: string) => Promise<boolean>;
  label?: string;
}) {
  const colors = useThemeColors();
  const [code, setCode] = useState("");
  const busy = useVouchers((state) => state.codeBusy);
  const notice = useVouchers((state) => state.codeNotice);
  const lockedUntil = useVouchers((state) => state.lockedUntil);
  const now = useServerNow(15_000);
  const locked = lockedUntil != null && Date.parse(lockedUntil) > now;
  const blocked = busy || locked || !code.trim();

  const submit = async () => {
    if (blocked) return;
    if (await onSubmit(code)) setCode("");
  };

  return (
    <View className="gap-2">
      <Text className="text-body font-medium text-text-primary">{label}</Text>
      <View className="flex-row items-center gap-2">
        <View className="min-w-0 flex-1">
          <TextField
            value={code}
            onChangeText={setCode}
            placeholder="e.g. TESTERS15"
            accessibilityLabel="Voucher code"
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={40}
            editable={!locked}
            returnKeyType="done"
            onSubmitEditing={() => void submit()}
          />
        </View>
        <Pressable
          onPress={() => void submit()}
          disabled={blocked}
          accessibilityRole="button"
          accessibilityLabel="Add code"
          accessibilityState={{ disabled: blocked, busy }}
          className={blocked ? "gg-btn-secondary gg-disabled h-12" : "gg-btn-secondary h-12"}
          style={({ pressed }) => (pressed && !blocked ? { opacity: 0.7 } : undefined)}
        >
          {busy ? <ActivityIndicator size="small" color={colors.textPrimary} /> : null}
          <Text className="text-button text-text-primary">{busy ? "Checking" : "Add"}</Text>
        </Pressable>
      </View>

      {locked ? (
        <Notice ok={false} text={`Too many codes that did not work. You can try again at ${shortTime(lockedUntil)}.`} />
      ) : notice ? (
        <Notice ok={notice.ok} text={notice.text} />
      ) : null}
    </View>
  );
}

function Notice({ ok, text }: { ok: boolean; text: string }) {
  const colors = useThemeColors();
  const Icon = ok ? CircleCheck : CircleAlert;
  return (
    <View className="flex-row items-start gap-2" accessibilityLiveRegion="polite" accessibilityRole={ok ? "text" : "alert"}>
      <View className="pt-0.5">
        <Icon size={16} color={ok ? colors.success : colors.error} strokeWidth={2} aria-hidden />
      </View>
      <Text className={`min-w-0 flex-1 text-caption ${ok ? "text-success" : "text-error"}`}>{text}</Text>
    </View>
  );
}
