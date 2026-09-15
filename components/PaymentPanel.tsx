import { useCallback, useEffect, useRef, useState } from "react";
import { Image, Modal, Text, View } from "react-native";
import { useFocusEffect } from "expo-router";

import { ConfirmDialog } from "@/components/ConfirmDialog";
import { ErrorState } from "@/components/ErrorState";
import { FormField } from "@/components/form/FormField";
import { TextField } from "@/components/form/TextField";
import { PaymentProofRow } from "@/components/PaymentProofRow";
import { PrimaryButton } from "@/components/PrimaryButton";
import { SecondaryButton } from "@/components/SecondaryButton";
import { QrPaySheet, paymentQrFromSettings } from "@/components/QrPaySheet";
import { SpecRow } from "@/components/SpecRow";
import { usePaymentProof } from "@/hooks/usePaymentProof";
import * as api from "@/lib/api";
import { formatPhp, type InstallmentCode, type Order } from "@/lib/api";
import { userFacingError } from "@/lib/copy";
import { afterPayCopy, checkPaymentReference, installmentLabel, MANUAL_CONFIRMATION_NOTICE, paymentInstallment, payInstruction } from "@/lib/payment";
import { liveGeneration } from "@/lib/live";
import { OCR_READING, OCR_UNREADABLE } from "@/lib/receiptOcr";
import { useOrderPayment } from "@/store/checkoutPayment";

type Props = { order: Order; installment: InstallmentCode; onSubmitted: (order: Order) => void };

/** A new order/installment gets fresh local confirmation state. */
export function PaymentPanel(props: Props) {
  return <PaymentForm key={`${props.order.id}:${props.installment}`} {...props} />;
}

function PaymentForm({ order, installment, onSubmitted }: Props) {
  const owner = `order:${order.id}:${installment}`;
  const proof = usePaymentProof(owner, useOrderPayment);
  // A stacked order screen can regain focus after another order owned the draft.
  useFocusEffect(useCallback(() => { useOrderPayment.getState().bind(owner); }, [owner]));
  const reference = useOrderPayment((state) => state.cartId === owner ? state.reference : "");
  const setReference = useOrderPayment((state) => state.setReference);
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const sending = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [viewingProof, setViewingProof] = useState(false);
  const [settings, setSettings] = useState<api.PlatformSettings | null>(null);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const loadSettings = useCallback(() => api.getSettings().then(
    (current) => { setSettings(current); setSettingsError(null); },
    () => { setSettingsError("The payment QR could not load. Try again before making a transfer."); },
  ), []);
  useEffect(() => { void loadSettings(); }, [loadSettings]);

  const record = paymentInstallment(order, installment);
  const dueMinor = record?.amountMinor ?? null;
  const check = checkPaymentReference(reference);
  const ocrReading = proof.ocr.status === "reading";
  const ready = proof.state.phase === "stored" && Boolean(proof.state.fileId) && check.ok && !ocrReading && dueMinor !== null && dueMinor > 0;
  const frozen = busy || confirming;

  async function submit() {
    if (sending.current || !ready || !proof.state.fileId) return;
    const sessionGeneration = liveGeneration();
    const receiptGeneration = useOrderPayment.getState().generation;
    sending.current = true;
    setBusy(true);
    setError(null);
    try {
      const updated = await api.submitPayment(order.id, installment, reference.trim(), proof.state.fileId);
      const current = useOrderPayment.getState();
      if (liveGeneration() !== sessionGeneration || current.cartId !== owner || current.generation !== receiptGeneration) return;
      current.reset();
      onSubmitted(updated);
    } catch (e) {
      setError(userFacingError(e, "Your receipt did not reach Operations. Your screenshot and reference are kept here. Try sending them again; do not pay twice."));
    } finally {
      sending.current = false;
      setBusy(false);
      setConfirming(false);
    }
  }

  return (
    <View className="gg-card gap-5">
      <View className="gap-2">
        <Text className="text-h2 text-text-primary">{installment === "balance" ? "Final payment due" : "Initial payment due"}</Text>
        <Text className="text-body text-text-secondary">{payInstruction(installment)}</Text>
        <Text className="text-display text-text-primary">{dueMinor !== null ? formatPhp(dueMinor) : "Amount unavailable"}</Text>
        <Text className="text-body text-text-secondary">{afterPayCopy(installment)}</Text>
      </View>

      {record?.rejectionReason ? <ErrorState label="Payment needs correction" body={`${record.rejectionReason} Check the existing transfer before paying again.`} /> : null}
      {settingsError ? <ErrorState label="QR unavailable" body={settingsError} onRetry={() => void loadSettings()} /> : null}
      <SecondaryButton label={!settings && !settingsError ? "Loading payment QR…" : "Show payment QR"} disabled={!settings || frozen} onPress={() => setShowQr(true)} />
      <QrPaySheet open={showQr} onClose={() => setShowQr(false)} downpaymentMinor={dueMinor} paymentKind={installment === "balance" ? "final" : "initial"} imageUrl={paymentQrFromSettings(settings)?.imageUrl} />

      <PaymentProofRow state={proof.state} reading={ocrReading} disabled={frozen}
        error={touched && !proof.state.fileId ? "Add the receipt screenshot from your wallet to continue." : null}
        onPick={() => void proof.pick()} onView={() => setViewingProof(true)} onReset={proof.reset} />
      <FormField label="Payment reference" error={touched && !check.ok && !ocrReading ? check.reason : null}
        helper={ocrReading ? OCR_READING : proof.ocr.status === "unreadable" ? OCR_UNREADABLE : "Check this number against your receipt. You can correct any digit before sending."}>
        <TextField value={reference} onChangeText={setReference} onBlur={() => setTouched(true)}
          accessibilityLabel="Payment reference" placeholder="Reference from your receipt" autoCapitalize="characters" autoCorrect={false} maxLength={64} editable={!frozen} />
      </FormField>
      {error ? <ErrorState label="Not sent" body={error} /> : null}
      <PrimaryButton label={busy ? "Sending receipt…" : ocrReading ? "Reading the reference…" : "Review payment details"}
        disabled={frozen || ocrReading || proof.state.phase === "sending"}
        onPress={() => { setTouched(true); if (ready) setConfirming(true); }} />
      <Text className="text-caption text-text-muted">Uploading a receipt does not confirm payment. Operations checks the transfer against the GRIDGO wallet.</Text>

      <ConfirmDialog visible={confirming} question="Send this payment for checking?"
        body={`Amount: ${dueMinor !== null ? formatPhp(dueMinor) : "—"}. Reference: ${reference.trim()}. Confirm that this matches your receipt. Operations still needs to verify the transfer.`}
        confirmLabel="Send receipt for checking" cancelLabel="Edit details" busy={busy}
        onConfirm={() => void submit()} onCancel={() => { if (!busy) setConfirming(false); }} />
      <Modal visible={viewingProof} transparent={false} onRequestClose={() => setViewingProof(false)}>
        <View className="flex-1 gap-4 bg-canvas px-4 pb-8 pt-12">
          <SecondaryButton label="Close receipt" onPress={() => setViewingProof(false)} />
          {proof.state.localUri ? <Image source={{ uri: proof.state.localUri }} accessibilityLabel="Payment receipt" resizeMode="contain" style={{ flex: 1, width: "100%" }} /> : null}
        </View>
      </Modal>
    </View>
  );
}

/**
 * The wait between sending a reference and Operations confirming it.
 *
 * A real state a person sits in, so it gets a real card rather than silence —
 * what was sent, when, and what happens when it clears.
 */
export function PaymentUnderReviewCard({
  order,
  installment,
}: {
  order: Order;
  installment: InstallmentCode;
}) {
  const record = paymentInstallment(order, installment);

  return (
    <View className="gg-card gap-4">
      {/* No status chip: the order header above already carries this state
          once, and a screen that says it twice reads as a draft. */}
      <View className="gap-2">
        <Text className="text-h3 text-text-primary">
          We are checking your {installment === "downpayment" ? "downpayment" : "balance payment"}.
        </Text>
        <Text className="text-body text-text-secondary">{MANUAL_CONFIRMATION_NOTICE}</Text>
      </View>

      <View className="gg-panel">
        <SpecRow label={installmentLabel(installment)} value={
          record?.amountMinor != null ? formatPhp(record.amountMinor) : "—"
        } />
        <SpecRow label="Reference you sent" value={record?.reference || "—"} />
      </View>

      <Text className="text-caption text-text-muted">
        {afterPayCopy(installment)} You get a notification either way, so there is nothing to
        watch here.
      </Text>
    </View>
  );
}
