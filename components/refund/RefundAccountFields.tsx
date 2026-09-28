import { Check, QrCode } from "lucide-react-native";
import { ActivityIndicator, Image, Pressable, Text, View } from "react-native";

import { FormField } from "@/components/form/FormField";
import { OptionPicker } from "@/components/form/OptionPicker";
import { TextField } from "@/components/form/TextField";
import { SecondaryButton } from "@/components/SecondaryButton";
import { useThemeColors } from "@/hooks/useTheme";
import { MAX_ACCOUNT_NAME, REFUND_PROVIDERS, REFUND_QR_MAX_MIB } from "@/lib/refunds";
import type { RefundProvider } from "@/lib/api";
import { useRefundDraft } from "@/store/refundDraft";

/**
 * Where the refund goes: the client's own receiving QR, which wallet it is,
 * the name on it, and their word that it is theirs.
 *
 * Operations pays by scanning this QR from GRIDGO's wallet and checks the
 * name the wallet shows against the one typed here, so the name is asked for
 * as it appears in the wallet, not as the client's display name.
 */
export function RefundAccountFields({ disabled = false }: { disabled?: boolean }) {
  const colors = useThemeColors();
  const qr = useRefundDraft((state) => state.qr);
  const provider = useRefundDraft((state) => state.provider);
  const accountName = useRefundDraft((state) => state.accountName);
  const owned = useRefundDraft((state) => state.ownershipConfirmed);
  const pickQr = useRefundDraft((state) => state.pickQr);
  const setProvider = useRefundDraft((state) => state.setProvider);
  const setAccountName = useRefundDraft((state) => state.setAccountName);
  const setOwned = useRefundDraft((state) => state.setOwnershipConfirmed);

  const sending = qr?.phase === "sending";

  return (
    <View className="gap-5">
      <View className={qr?.phase === "failed" ? "gg-card gap-3 border-error" : "gg-card gap-3"}>
        <View className="flex-row items-center justify-between gap-3">
          <Text className="min-w-0 flex-1 text-body-lg font-medium text-text-primary">Receiving QR</Text>
          {sending ? (
            <View className="flex-row items-center gap-2">
              <ActivityIndicator size="small" color={colors.textMuted} />
              <Text className="text-caption text-text-muted">
                {qr.progress == null ? "Sending…" : `${Math.round(qr.progress * 100)}%`}
              </Text>
            </View>
          ) : qr?.phase === "stored" ? (
            <View className="gg-chip">
              <Check size={13} color={colors.success} strokeWidth={2.5} />
              <Text className="text-caption text-text-secondary">Uploaded</Text>
            </View>
          ) : null}
        </View>
        {qr?.localUri && qr.phase !== "failed" ? (
          <View className="overflow-hidden rounded-field bg-surface-variant" style={{ height: 180 }}>
            <Image
              source={{ uri: qr.localUri }}
              accessibilityLabel="Your receiving QR"
              resizeMode="contain"
              style={{ width: "100%", height: "100%" }}
            />
          </View>
        ) : (
          <View className="h-24 flex-row items-center gap-3 rounded-field border border-dashed border-outline px-4">
            <QrCode size={28} color={colors.textMuted} strokeWidth={1.75} />
            <Text className="min-w-0 flex-1 text-caption text-text-muted">
              The QR you receive money with — from Receive money in GCash, Maya or your bank app. A screenshot works.
            </Text>
          </View>
        )}
        <Text className={qr?.phase === "failed" ? "text-caption text-error" : "text-caption text-text-muted"}>
          {qr?.phase === "failed" && qr.error
            ? qr.error
            : `JPEG, PNG or WebP, up to ${REFUND_QR_MAX_MIB} MB. Only you and GRIDGO Operations can see it.`}
        </Text>
        <SecondaryButton
          label={qr ? "Choose a different QR" : "Upload receiving QR"}
          disabled={disabled || sending}
          onPress={() => void pickQr()}
        />
      </View>

      <FormField label="Wallet">
        <OptionPicker
          title="Which wallet is this QR for?"
          accessibilityLabel="Wallet"
          value={provider ?? ""}
          options={REFUND_PROVIDERS}
          onChange={(value) => setProvider(value as RefundProvider)}
          placeholder="Choose GCash, Maya or bank"
          disabled={disabled}
        />
      </FormField>

      <FormField
        label="Name on the account"
        helper="As your wallet shows it. Operations checks this name before sending."
      >
        <TextField
          value={accountName}
          onChangeText={setAccountName}
          placeholder="Juan D. Dela Cruz"
          accessibilityLabel="Name on the account"
          autoCapitalize="words"
          maxLength={MAX_ACCOUNT_NAME}
          editable={!disabled}
        />
      </FormField>

      <Pressable
        onPress={() => setOwned(!owned)}
        disabled={disabled}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: owned, disabled }}
        accessibilityLabel="This receiving account is mine"
        className="gg-touch flex-row items-start gap-3 py-1"
      >
        <View
          className={
            owned
              ? "mt-0.5 h-6 w-6 items-center justify-center rounded-sm bg-accent"
              : "mt-0.5 h-6 w-6 items-center justify-center rounded-sm border border-outline bg-surface"
          }
        >
          {owned ? <Check size={16} color={colors.accentOn} strokeWidth={2.5} /> : null}
        </View>
        <View className="min-w-0 flex-1 gap-1">
          <Text className="text-body text-text-primary">This receiving account is mine</Text>
          <Text className="text-caption text-text-muted">
            GRIDGO returns money only to the person who paid it.
          </Text>
        </View>
      </Pressable>
    </View>
  );
}
