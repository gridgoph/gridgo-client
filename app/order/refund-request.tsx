import { useLocalSearchParams, useRouter } from "expo-router";
import { Trash2 } from "lucide-react-native";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Image, Pressable, Text, View } from "react-native";

import { ConfirmDialog } from "@/components/ConfirmDialog";
import { ErrorState } from "@/components/ErrorState";
import { FormField, FormSection } from "@/components/form/FormField";
import { OptionPicker } from "@/components/form/OptionPicker";
import { TextField } from "@/components/form/TextField";
import { FormScreen } from "@/components/FormScreen";
import { PrimaryButton } from "@/components/PrimaryButton";
import { RefundAccountFields } from "@/components/refund/RefundAccountFields";
import { SecondaryButton } from "@/components/SecondaryButton";
import { SkeletonLine, SkeletonList } from "@/components/Skeleton";
import { useThemeColors } from "@/hooks/useTheme";
import * as api from "@/lib/api";
import type { RefundKind } from "@/lib/api";
import { refundErrorMessage } from "@/lib/copy";
import {
  MAX_REFUND_EVIDENCE,
  MAX_REFUND_REASON,
  REFUND_CLOSED_COPY,
  REFUND_EVIDENCE_MAX_MIB,
  REFUND_KINDS,
  checkRefundReason,
  destinationInput,
  handoverCompleted,
  missingDestination,
  refundEntry,
  refundPolicyCopy,
  type RefundEntry,
} from "@/lib/refunds";
import { useRefundDraft } from "@/store/refundDraft";

/**
 * Asking for a refund: why, any photos, and where the money should go.
 *
 * The screen opens on what asking does — how much can come back and why, the
 * pause it puts on the job, and the time limit — because a refund form that
 * only explains itself in its refusals reads as a trap. The receiving QR is
 * asked for here rather than later: Operations cannot send anything without
 * it, and a request that stalls on a missing QR is a request that looks lost.
 *
 * The draft lives in `store/refundDraft.ts` so uploads survive a detour to
 * Photos or a step back to the order — leaving never throws the draft away,
 * so there is no "discard?" question — and so the idempotency key belongs to the body as it stands: a retry
 * after a lost answer replays, an edit starts afresh.
 */
export default function RefundRequestScreen() {
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const router = useRouter();
  const colors = useThemeColors();

  const [order, setOrder] = useState<api.Order | null>(null);
  const [entry, setEntry] = useState<RefundEntry | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const bind = useRefundDraft((state) => state.bind);
  const kind = useRefundDraft((state) => state.kind);
  const reason = useRefundDraft((state) => state.reason);
  const evidence = useRefundDraft((state) => state.evidence);
  const qr = useRefundDraft((state) => state.qr);
  const provider = useRefundDraft((state) => state.provider);
  const accountName = useRefundDraft((state) => state.accountName);
  const owned = useRefundDraft((state) => state.ownershipConfirmed);
  const busy = useRefundDraft((state) => state.busy);
  const error = useRefundDraft((state) => state.error);
  const setKind = useRefundDraft((state) => state.setKind);
  const setReason = useRefundDraft((state) => state.setReason);
  const addEvidence = useRefundDraft((state) => state.addEvidence);
  const removeEvidence = useRefundDraft((state) => state.removeEvidence);

  useEffect(() => {
    if (orderId) bind(`request:${orderId}`);
  }, [bind, orderId]);

  const load = useCallback(async () => {
    if (!orderId) return;
    try {
      const [nextOrder, refunds] = await Promise.all([api.getOrder(orderId), api.listOrderRefunds(orderId)]);
      setOrder(nextOrder);
      setEntry(refundEntry(nextOrder, refunds));
      setLoadError(null);
      // The likelier of the two, chosen for them: after handover it is about
      // the goods, before it the client is calling the job off.
      const draft = useRefundDraft.getState();
      if (!draft.kind) draft.setKind(handoverCompleted(nextOrder) ? "complaint" : "cancellation");
    } catch (caught) {
      setLoadError(refundErrorMessage(caught, "GRIDGO could not open this order. Check your connection and try again."));
    }
  }, [orderId]);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  const reasonProblem = checkRefundReason(reason);
  const destination = { qrFileId: qr?.phase === "stored" ? qr.fileId : null, provider, accountName, ownershipConfirmed: owned };
  const uploading = qr?.phase === "sending" || evidence.some((slot) => slot.phase === "sending");
  const missing = !kind
    ? "Choose what you are asking for."
    : reasonProblem
      ? reasonProblem
      : uploading
        ? "Wait for the uploads to finish."
        : missingDestination(destination);

  const send = async () => {
    const draft = useRefundDraft.getState();
    const input = destinationInput(destination);
    if (!orderId || !kind || !input || draft.busy) return;
    draft.setBusy(true);
    draft.setError(null);
    try {
      const refund = await api.requestRefund(
        orderId,
        {
          kind,
          reason: reason.trim(),
          evidenceFileIds: evidence.flatMap((slot) => (slot.phase === "stored" && slot.fileId ? [slot.fileId] : [])),
          destination: input,
        },
        draft.keyForSend(),
      );
      setConfirming(false);
      useRefundDraft.getState().reset();
      router.replace({ pathname: "/order/refund", params: { orderId, refundId: refund.id } });
    } catch (caught) {
      setConfirming(false);
      useRefundDraft
        .getState()
        .setError(refundErrorMessage(caught, "The request did not reach Operations. Check your connection and send it again."));
    } finally {
      useRefundDraft.getState().setBusy(false);
    }
  };

  if (loadError && !order) {
    return (
      <FormScreen>
        <View className="gg-page gap-3 pt-4">
          <ErrorState label="Could not open" body={loadError} onRetry={() => void load()} />
        </View>
      </FormScreen>
    );
  }

  if (!order || !entry) {
    return (
      <FormScreen>
        <View className="gg-page gap-4 pt-4" accessibilityLabel="Loading">
          <SkeletonLine width="w-3/4" height="h-7" />
          <SkeletonList count={2} />
        </View>
      </FormScreen>
    );
  }

  if (entry.kind !== "eligible") {
    return (
      <FormScreen>
        <View className="gg-page gap-4 pt-4">
          <Text className="text-h2 text-text-primary">
            {entry.kind === "open" ? "A refund request is already open" : "A refund cannot be requested here"}
          </Text>
          <Text className="text-body-lg text-text-secondary">
            {entry.kind === "open"
              ? "Only one request can be open on an order. Open it to see where it stands."
              : entry.kind === "closed"
                ? REFUND_CLOSED_COPY
                : "There is no confirmed payment on this order to refund."}
          </Text>
          {entry.kind === "open" ? (
            <SecondaryButton
              label="View refund"
              onPress={() => router.replace({ pathname: "/order/refund", params: { orderId: order.id } })}
            />
          ) : (
            <SecondaryButton label="Back to the order" onPress={() => router.back()} />
          )}
        </View>
      </FormScreen>
    );
  }

  const policy = refundPolicyCopy(entry);

  return (
    <FormScreen
      overlay={
        <ConfirmDialog
          visible={confirming}
          question={`Send a refund request for ${order.title}?`}
          body="The job pauses while Operations reviews it. You can withdraw the request until they approve an amount."
          confirmLabel="Send request"
          cancelLabel="Not yet"
          busy={busy}
          onConfirm={() => void send()}
          onCancel={() => setConfirming(false)}
        />
      }
      footer={
        <View className="gap-3 border-t border-outline bg-surface px-4 pb-2 pt-3">
          {error ? <Text className="text-body text-error">{error}</Text> : null}
          {missing && !busy ? <Text className="text-caption text-text-muted">{missing}</Text> : null}
          <PrimaryButton
            label={busy ? "Sending…" : "Send refund request"}
            disabled={Boolean(missing) || busy}
            onPress={() => setConfirming(true)}
          />
        </View>
      }
    >
      <View className="gg-page gap-8 pb-8 pt-4">
        <View className="gap-3">
          <Text className="text-h1 text-text-primary">{policy.headline}</Text>
          <Text className="text-caption text-text-muted">For {order.title}</Text>
          <View className="gg-panel gap-3">
            {policy.points.map((point) => (
              <View key={point} className="flex-row gap-3">
                <View className="mt-2 h-1.5 w-1.5 rounded-pill bg-text-muted" />
                <Text className="min-w-0 flex-1 text-body text-text-secondary">{point}</Text>
              </View>
            ))}
          </View>
        </View>

        <FormSection title="WHY">
          <FormField label="What you are asking for">
            <OptionPicker
              title="What are you asking for?"
              accessibilityLabel="What you are asking for"
              value={kind ?? ""}
              options={REFUND_KINDS}
              onChange={(value) => setKind(value as RefundKind)}
              placeholder="Choose one"
              disabled={busy}
            />
          </FormField>
          <FormField
            label="Tell Operations what happened"
            helper="Operations decides on what you write here, so say what went wrong and when."
            error={reason.length > 0 ? reasonProblem : null}
          >
            <TextField
              value={reason}
              onChangeText={setReason}
              placeholder="The flyers arrived with the brand red printed orange across all 200."
              accessibilityLabel="Tell Operations what happened"
              multiline
              maxLength={MAX_REFUND_REASON}
              editable={!busy}
            />
          </FormField>
          <FormField
            label="Photos"
            optional
            helper={`Up to ${MAX_REFUND_EVIDENCE} images, ${REFUND_EVIDENCE_MAX_MIB} MB each. Only you and Operations see them.`}
          >
            <View className="gap-2">
              {evidence.map((slot, index) => (
                <View key={slot.key} className="gg-card flex-row items-center gap-3 p-3">
                  {slot.localUri ? (
                    <Image
                      source={{ uri: slot.localUri }}
                      accessibilityLabel={`Photo ${index + 1}`}
                      resizeMode="cover"
                      style={{ width: 48, height: 48, borderRadius: 8 }}
                    />
                  ) : null}
                  <View className="min-w-0 flex-1">
                    <Text numberOfLines={1} className="text-body text-text-primary">{slot.fileName}</Text>
                    <Text className={slot.phase === "failed" ? "text-caption text-error" : "text-caption text-text-muted"}>
                      {slot.phase === "failed"
                        ? slot.error
                        : slot.phase === "sending"
                          ? slot.progress == null ? "Sending…" : `Sending — ${Math.round(slot.progress * 100)}%`
                          : "Uploaded"}
                    </Text>
                  </View>
                  {slot.phase === "sending" ? <ActivityIndicator size="small" color={colors.textMuted} /> : null}
                  <Pressable
                    onPress={() => removeEvidence(slot.key)}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove photo ${index + 1}`}
                    className="gg-touch items-center justify-center"
                  >
                    <Trash2 size={18} color={colors.textSecondary} strokeWidth={2} />
                  </Pressable>
                </View>
              ))}
              {evidence.length < MAX_REFUND_EVIDENCE ? (
                <SecondaryButton label="Add a photo" disabled={busy} onPress={() => void addEvidence()} />
              ) : null}
            </View>
          </FormField>
        </FormSection>

        <FormSection title="WHERE TO SEND IT">
          <Text className="text-body text-text-secondary">
            Operations sends refunds by hand from GRIDGO&apos;s wallet to your own receiving QR.
          </Text>
          <RefundAccountFields disabled={busy} />
        </FormSection>
      </View>

    </FormScreen>
  );
}
