import { useCallback, useEffect, useRef, useState } from "react";
import { Image, Modal, Text, View } from "react-native";
import { useFocusEffect } from "expo-router";

import { ConfirmDialog } from "@/components/ConfirmDialog";
import { ErrorState } from "@/components/ErrorState";
import { FormField } from "@/components/form/FormField";
import { TextField } from "@/components/form/TextField";
import { PaymentProofRow } from "@/components/PaymentProofRow";
import { PrimaryButton } from "@/components/PrimaryButton";
import { QrPaySheet, paymentQrFromSettings } from "@/components/QrPaySheet";
import { SecondaryButton } from "@/components/SecondaryButton";
import { usePaymentProof } from "@/hooks/usePaymentProof";
import * as api from "@/lib/api";
import { formatPhp } from "@/lib/api";
import { userFacingError } from "@/lib/copy";
import { liveGeneration } from "@/lib/live";
import { checkPaymentReference, FULL_PAYMENT_PERCENT } from "@/lib/payment";
import { OCR_READING, OCR_UNREADABLE } from "@/lib/receiptOcr";
import type { PaymentDraftStore } from "@/store/checkoutPayment";

type Props = {
  /** One draft per transfer: a new ask never carries the last screenshot over. */
  draftKey: string;
  draft: PaymentDraftStore;
  amountMinor: number;
  /** Operations' reason, after a transfer they could not match. */
  rejectionReason?: string | null;
  paymentKind: "pin" | "change";
  /** What happens once Operations verifies the transfer, for the confirm dialog. */
  afterConfirmed: string;
  /** The one yellow control on the screen, unless something else holds it. */
  primary: boolean;
  /** Files the transfer on its own route; resolves once GRIDGO has it. */
  send: (input: { proofFileId: string; reference: string }, idempotencyKey: string) => Promise<void>;
  onConflict: () => void;
};

/**
 * A QR top-up on a placed order — a dearer delivery pin, an approved change:
 * the same QR, screenshot and reference as every other payment, sent to its
 * own route. Sending it is not paying — Operations still matches it against
 * GRIDGO's wallet before anything moves.
 */
export function QrTopUpForm(props: Props) {
  // A new ask is a new transfer: never carry the last one's screenshot over.
  return <QrTopUpFields key={props.draftKey} {...props} />;
}

function QrTopUpFields({ draftKey: owner, draft, amountMinor: amount, rejectionReason, paymentKind, afterConfirmed, primary, send, onConflict }: Props) {
  const proof = usePaymentProof(owner, draft);
  useFocusEffect(useCallback(() => { draft.getState().bind(owner); }, [draft, owner]));
  const reference = draft((state) => (state.cartId === owner ? state.reference : ""));
  const setReference = draft((state) => state.setReference);
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [viewingProof, setViewingProof] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState<api.PlatformSettings | null>(null);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const sending = useRef(false);
  const attempt = useRef<{ body: string; key: string } | null>(null);
  const loadSettings = useCallback(() => api.getSettings().then(
    (current) => { setSettings(current); setSettingsError(null); },
    () => { setSettingsError("The payment QR could not load. Try again before making a transfer."); },
  ), []);
  useEffect(() => { void loadSettings(); }, [loadSettings]);

  const check = checkPaymentReference(reference);
  const ocrReading = proof.ocr.status === "reading";
  const ready = proof.state.phase === "stored" && Boolean(proof.state.fileId) && check.ok && !ocrReading;
  const frozen = busy || confirming;

  async function submit() {
    const fileId = proof.state.fileId;
    if (sending.current || !ready || !fileId) return;
    const generation = liveGeneration();
    const input = { proofFileId: fileId, reference: reference.trim() };
    const body = JSON.stringify(input);
    // A retry of the same transfer reuses its key, so it can never be filed twice.
    if (attempt.current?.body !== body) attempt.current = { body, key: api.newIdempotencyKey() };
    sending.current = true;
    setBusy(true);
    setError(null);
    try {
      await send(input, attempt.current.key);
      if (liveGeneration() !== generation) return;
      attempt.current = null;
      draft.getState().reset();
    } catch (caught) {
      setError(userFacingError(caught, "Your receipt did not reach Operations. Your screenshot and reference are kept here. Try sending them again; do not pay twice."));
      if (caught instanceof api.ApiError && caught.status === 409) onConflict();
    } finally {
      sending.current = false;
      setBusy(false);
      setConfirming(false);
    }
  }

  return (
    <View className="gap-4">
      {rejectionReason ? (
        <ErrorState
          label="Payment not confirmed"
          body={`${sentence(rejectionReason)} Check your wallet before paying again, and send a new screenshot.`}
        />
      ) : null}
      {settingsError ? <ErrorState label="QR unavailable" body={settingsError} onRetry={() => void loadSettings()} /> : null}
      <SecondaryButton
        label={!settings && !settingsError ? "Loading payment QR…" : "Show payment QR"}
        disabled={!settings || frozen}
        onPress={() => setShowQr(true)}
      />
      <QrPaySheet
        open={showQr}
        onClose={() => setShowQr(false)}
        downpaymentMinor={amount}
        downpaymentPercent={FULL_PAYMENT_PERCENT}
        paymentKind={paymentKind}
        imageUrl={paymentQrFromSettings(settings)?.imageUrl}
      />
      <PaymentProofRow
        state={proof.state}
        reading={ocrReading}
        disabled={frozen}
        error={touched && !proof.state.fileId ? "Add the receipt screenshot from your wallet to continue." : null}
        onPick={() => void proof.pick()}
        onView={() => setViewingProof(true)}
        onReset={proof.reset}
      />
      <FormField
        label="Payment reference"
        error={touched && !check.ok && !ocrReading ? check.reason : null}
        helper={ocrReading ? OCR_READING : proof.ocr.status === "unreadable" ? OCR_UNREADABLE : "Check this number against your receipt. You can correct any digit before sending."}
      >
        <TextField
          value={reference}
          onChangeText={setReference}
          onBlur={() => setTouched(true)}
          accessibilityLabel="Payment reference"
          placeholder="Reference from your receipt"
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={64}
          editable={!frozen}
        />
      </FormField>
      {error ? <ErrorState label="Not sent" body={error} /> : null}
      {primary ? (
        <PrimaryButton
          label={busy ? "Sending receipt…" : ocrReading ? "Reading the reference…" : "Review payment details"}
          disabled={frozen || ocrReading || proof.state.phase === "sending"}
          onPress={() => { setTouched(true); if (ready) setConfirming(true); }}
        />
      ) : (
        <SecondaryButton
          label={busy ? "Sending receipt…" : ocrReading ? "Reading the reference…" : "Review payment details"}
          disabled={frozen || ocrReading || proof.state.phase === "sending"}
          onPress={() => { setTouched(true); if (ready) setConfirming(true); }}
        />
      )}
      <Text className="text-caption text-text-muted">
        Uploading a receipt does not confirm payment. Operations checks the transfer against the GRIDGO wallet.
      </Text>

      <ConfirmDialog
        visible={confirming}
        question="Send this payment for checking?"
        body={`Amount: ${formatPhp(amount)}. Reference: ${reference.trim()}. Confirm that this matches your receipt. ${afterConfirmed}`}
        confirmLabel="Send receipt for checking"
        cancelLabel="Edit details"
        busy={busy}
        onConfirm={() => void submit()}
        onCancel={() => { if (!busy) setConfirming(false); }}
      />
      <Modal visible={viewingProof} transparent={false} onRequestClose={() => setViewingProof(false)}>
        <View className="flex-1 gap-4 bg-canvas px-4 pb-8 pt-12">
          <SecondaryButton label="Close receipt" onPress={() => setViewingProof(false)} />
          {proof.state.localUri ? (
            <Image source={{ uri: proof.state.localUri }} accessibilityLabel="Payment receipt" resizeMode="contain" style={{ flex: 1, width: "100%" }} />
          ) : null}
        </View>
      </Modal>
    </View>
  );
}

/** Operations types the reason by hand; end it as a sentence before ours follows. */
function sentence(text: string): string {
  const trimmed = text.trim();
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}
