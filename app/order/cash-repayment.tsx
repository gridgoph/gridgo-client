import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Image, Modal, Text, View } from "react-native";
import { CashOrderCard } from "@/components/CashOrderCard";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { ErrorState } from "@/components/ErrorState";
import { FormScreen } from "@/components/FormScreen";
import { FormField } from "@/components/form/FormField";
import { TextField } from "@/components/form/TextField";
import { PaymentProofRow } from "@/components/PaymentProofRow";
import { PrimaryButton } from "@/components/PrimaryButton";
import { SecondaryButton } from "@/components/SecondaryButton";
import { paymentQrFromSettings, QrPaySheet } from "@/components/QrPaySheet";
import { SkeletonList } from "@/components/Skeleton";
import { useLiveRefresh } from "@/hooks/useLiveRefresh";
import { usePaymentProof } from "@/hooks/usePaymentProof";
import { formatPhp, type Order } from "@/lib/api";
import { repaymentState } from "@/lib/cash";
import { checkPaymentReference } from "@/lib/payment";
import { OCR_READING, OCR_UNREADABLE } from "@/lib/receiptOcr";
import { useCashRepayment } from "@/store/cashRepayment";
import { useCashPayment } from "@/store/checkoutPayment";
import { usePlatformSettings } from "@/store/platformSettings";

export default function CashRepaymentScreen() {
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const router = useRouter();
  const owner = orderId ?? null;
  const proof = usePaymentProof(owner, useCashPayment, "cash_repayment_proof");
  const reference = useCashPayment((state) => state.cartId === owner ? state.reference : "");
  const setReference = useCashPayment((state) => state.setReference);
  const state = useCashRepayment();
  const settings = usePlatformSettings((state) => state.settings);
  const [showQr, setShowQr] = useState(false);
  const [viewingProof, setViewingProof] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [touched, setTouched] = useState(false);
  const load = useCallback(async () => { if (orderId) await useCashRepayment.getState().load(orderId); }, [orderId]);
  useFocusEffect(useCallback(() => {
    useCashPayment.getState().bind(owner);
    void load();
    void usePlatformSettings.getState().load().catch(() => undefined);
  }, [load, owner]));
  useLiveRefresh(["orders"], load, { refreshOnFocus: false });
  const cash = state.orderId === orderId ? state.cash : null;
  const status = repaymentState(cash);
  const allowed = cash && cash.noShowApprovedAt && !cash.repaymentConfirmedAt && cash.amountDueMinor > 0 && ["none", "rejected"].includes(status);
  const check = checkPaymentReference(reference);
  const reading = proof.ocr.status === "reading";
  const ready = allowed && !state.loading && !state.loadError && proof.state.phase === "stored" && check.ok && !reading;
  const frozen = state.busy || confirming;
  // The minimized cash detail carries the facts needed by the shared status card.
  const statusOrder = { id: orderId, totalMinor: cash?.amountDueMinor ?? null, cash: { method: "cash", version: cash?.version ?? 1, status: cash?.repaymentConfirmedAt || status === "confirmed" ? "no_show_repaid" : "online_repayment_required" } } as Order;
  return (
    <FormScreen>
      <View className="gg-page gap-5 pb-16 pt-4">
        <Text className="text-h2 text-text-primary">Repay your cash order</Text>
        {state.loadError ? <ErrorState label="Cash status did not load" body={state.loadError} onRetry={() => void load()} /> : null}
        {!cash && !state.loadError ? <SkeletonList count={2} /> : null}
        {cash && !allowed ? (
          cash.noShowApprovedAt ? <CashOrderCard order={statusOrder} detail={cash} /> : <Text className="text-body text-text-secondary">This order has no online cash repayment due.</Text>
        ) : null}
        {allowed && cash ? (
          <>
            <Text className="text-display text-text-primary">{formatPhp(cash.amountDueMinor)}</Text>
            <Text className="text-body text-text-secondary">This covers your order and its original delivery fare. Send the exact amount to GRIDGO by QR, then add the transfer receipt and reference. Operations must confirm it before cash is available again. Redelivery costs extra.</Text>
            {status === "rejected" ? <CashOrderCard order={statusOrder} detail={cash} /> : null}
            <SecondaryButton label="Show the GRIDGO QR to scan" disabled={frozen || Boolean(state.loadError)} onPress={() => setShowQr(true)} />
            <PaymentProofRow state={proof.state} reading={reading} disabled={frozen}
              error={touched && !proof.state.fileId ? "Add your transfer receipt to continue." : null}
              onPick={() => void proof.pick()} onView={() => setViewingProof(true)} onReset={proof.reset} />
            <FormField label="Payment reference" error={touched && !check.ok && !reading ? check.reason : null}
              helper={reading ? OCR_READING : proof.ocr.status === "unreadable" ? OCR_UNREADABLE : "Check the reference against your transfer receipt. Do not pay twice."}>
              <TextField accessibilityLabel="Payment reference" value={reference} onChangeText={setReference}
                placeholder="Reference from your receipt" autoCapitalize="characters" autoCorrect={false} maxLength={100} editable={!frozen} />
            </FormField>
            {state.error ? <ErrorState label="Not sent" body={state.error} /> : null}
            <PrimaryButton label={state.busy ? "Sending receipt…" : "Review repayment"} disabled={frozen || reading || state.loading || Boolean(state.loadError) || proof.state.phase === "sending"}
              onPress={() => { setTouched(true); if (ready) setConfirming(true); }} />
            <Text className="text-caption text-text-muted">Submitting proof does not confirm payment. Operations checks the transfer.</Text>
          </>
        ) : null}
        <SecondaryButton label="Back to the order" disabled={state.busy} onPress={() => router.back()} />
      </View>
      <QrPaySheet open={showQr} onClose={() => setShowQr(false)} downpaymentMinor={cash?.amountDueMinor ?? null} downpaymentPercent={100} paymentKind="repayment" imageUrl={paymentQrFromSettings(settings)?.imageUrl} />
      <ConfirmDialog visible={confirming} question="Send this repayment for checking?" body={`Amount: ${cash ? formatPhp(cash.amountDueMinor) : "—"}. Reference: ${reference.trim()}. Operations still needs to verify the transfer.`}
        confirmLabel="Send receipt for checking" cancelLabel="Edit details" busy={state.busy}
        onConfirm={() => { if (orderId) void state.submit(orderId).finally(() => setConfirming(false)); }} onCancel={() => { if (!state.busy) setConfirming(false); }} />
      <Modal visible={viewingProof} onRequestClose={() => setViewingProof(false)}>
        <View className="flex-1 gap-4 bg-canvas px-4 pb-8 pt-12">
          <SecondaryButton label="Close receipt" onPress={() => setViewingProof(false)} />
          {proof.state.localUri ? <Image source={{ uri: proof.state.localUri }} accessibilityLabel="Repayment receipt" resizeMode="contain" style={{ flex: 1, width: "100%" }} /> : null}
        </View>
      </Modal>
    </FormScreen>
  );
}
