import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Text, View } from "react-native";

import { ConfirmDialog } from "@/components/ConfirmDialog";
import { ErrorState } from "@/components/ErrorState";
import { FormScreen } from "@/components/FormScreen";
import { PrimaryButton } from "@/components/PrimaryButton";
import { RefundAccountFields } from "@/components/refund/RefundAccountFields";
import { SecondaryButton } from "@/components/SecondaryButton";
import { SkeletonList } from "@/components/Skeleton";
import * as api from "@/lib/api";
import { refundErrorMessage } from "@/lib/copy";
import { canReplaceDestination, destinationInput, missingDestination } from "@/lib/refunds";
import { useRefundDraft } from "@/store/refundDraft";

/**
 * Change where a refund is sent.
 *
 * Allowed until Operations starts a transfer. A new account is checked
 * before anything is sent — including on a refund already approved — so the
 * screen says that before the button rather than after it.
 */
export default function RefundAccountScreen() {
  const { refundId } = useLocalSearchParams<{ orderId: string; refundId: string }>();
  const router = useRouter();
  const [refund, setRefund] = useState<api.Refund | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const bind = useRefundDraft((state) => state.bind);
  const qr = useRefundDraft((state) => state.qr);
  const provider = useRefundDraft((state) => state.provider);
  const accountName = useRefundDraft((state) => state.accountName);
  const owned = useRefundDraft((state) => state.ownershipConfirmed);
  const busy = useRefundDraft((state) => state.busy);
  const error = useRefundDraft((state) => state.error);

  useEffect(() => {
    if (refundId) bind(`account:${refundId}`);
  }, [bind, refundId]);

  const load = useCallback(async () => {
    if (!refundId) return;
    try {
      setRefund(await api.getRefund(refundId));
      setLoadError(null);
    } catch (caught) {
      setLoadError(refundErrorMessage(caught, "GRIDGO could not open this refund. Check your connection and try again."));
    }
  }, [refundId]);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  const destination = { qrFileId: qr?.phase === "stored" ? qr.fileId : null, provider, accountName, ownershipConfirmed: owned };
  const missing = qr?.phase === "sending" ? "Wait for the QR to finish uploading." : missingDestination(destination);

  const save = async () => {
    const draft = useRefundDraft.getState();
    const input = destinationInput(destination);
    if (!refund || !input || draft.busy) return;
    draft.setBusy(true);
    draft.setError(null);
    try {
      await api.replaceRefundDestination(refund.id, { ...input, expectedVersion: refund.version }, draft.keyForSend());
      setConfirming(false);
      useRefundDraft.getState().reset();
      router.back();
    } catch (caught) {
      setConfirming(false);
      useRefundDraft
        .getState()
        .setError(refundErrorMessage(caught, "The new account was not saved. Check your connection and try again."));
      void load();
    } finally {
      useRefundDraft.getState().setBusy(false);
    }
  };

  if (!refund) {
    return (
      <FormScreen>
        <View className="gg-page gap-3 pt-4">
          {loadError ? (
            <ErrorState label="Could not open" body={loadError} onRetry={() => void load()} />
          ) : (
            <SkeletonList count={2} />
          )}
        </View>
      </FormScreen>
    );
  }

  if (!canReplaceDestination(refund)) {
    return (
      <FormScreen>
        <View className="gg-page gap-4 pt-4">
          <Text className="text-h2 text-text-primary">The receiving account is locked</Text>
          <Text className="text-body-lg text-text-secondary">
            Operations has started sending this refund, or it is finished, so the account it goes to
            cannot change. Message GRIDGO support if it is wrong.
          </Text>
          <SecondaryButton label="Back to the refund" onPress={() => router.back()} />
        </View>
      </FormScreen>
    );
  }

  const approved = refund.settlement != null;

  return (
    <FormScreen
      overlay={
        <ConfirmDialog
          visible={confirming}
          question="Send your refund to this account instead?"
          body={
            approved
              ? "Your refund stays approved. Operations checks the new account before sending it."
              : "Operations checks the new account along with your request."
          }
          confirmLabel="Use this account"
          cancelLabel="Not yet"
          busy={busy}
          onConfirm={() => void save()}
          onCancel={() => setConfirming(false)}
        />
      }
      footer={
        <View className="gap-3 border-t border-outline bg-surface px-4 pb-2 pt-3">
          {error ? <Text className="text-body text-error">{error}</Text> : null}
          {missing && !busy ? <Text className="text-caption text-text-muted">{missing}</Text> : null}
          <PrimaryButton
            label={busy ? "Saving…" : "Use this account"}
            disabled={Boolean(missing) || busy}
            onPress={() => setConfirming(true)}
          />
        </View>
      }
    >
      <View className="gg-page gap-6 pb-8 pt-4">
        <View className="gap-2">
          <Text className="text-h1 text-text-primary">
            {refund.destination ? "Change your receiving account" : "Add your receiving account"}
          </Text>
          <Text className="text-body text-text-secondary">
            {approved
              ? "Your refund stays approved. Operations checks the new account before anything is sent, so it may take a little longer."
              : "Operations checks this account before any refund is sent."}{" "}
            The old QR is kept on the record.
          </Text>
        </View>
        <RefundAccountFields disabled={busy} />
      </View>
    </FormScreen>
  );
}
