import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Text, View } from "react-native";

import { ConfirmDialog } from "@/components/ConfirmDialog";
import { ErrorState } from "@/components/ErrorState";
import { EvidencePhotoList } from "@/components/EvidencePhotoList";
import { FormField, FormSection } from "@/components/form/FormField";
import { OptionPicker } from "@/components/form/OptionPicker";
import { TextField } from "@/components/form/TextField";
import { FormScreen } from "@/components/FormScreen";
import { WhyWeAsk } from "@/components/legal/WhyWeAsk";
import { PrimaryButton } from "@/components/PrimaryButton";
import { RefundAccountFields } from "@/components/refund/RefundAccountFields";
import { RefundBreakdownCard } from "@/components/refund/RefundBreakdownCard";
import { SecondaryButton } from "@/components/SecondaryButton";
import { SkeletonLine, SkeletonList } from "@/components/Skeleton";
import * as api from "@/lib/api";
import type { RefundKind } from "@/lib/api";
import { refundErrorMessage } from "@/lib/copy";
import { storedFileIds } from "@/lib/imageUpload";
import {
  MAX_REFUND_EVIDENCE,
  MAX_REFUND_REASON,
  REFUND_CLOSED_COPY,
  REFUND_EVIDENCE_MAX_MIB,
  REFUND_KINDS,
  cancellationQuoteCopy,
  cancellationQuoteRefusal,
  checkRefundReason,
  destinationInput,
  handoverCompleted,
  missingDestination,
  refundEntry,
  refundPolicyCopy,
  refundReasonPlaceholder,
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
 * A cancellation shows the exact amount before it is confirmed
 * (`GET /orders/:id/cancellation-quote`) and is sent with that quote's token,
 * so what the client agreed to is what Operations settles. Facts that change
 * in between are refused as stale; the screen reads the amount again and asks
 * again rather than sending the new figure on the client's behalf. Where the
 * platform gives no automatic quote, the request still goes, but says plainly
 * that Operations works out the amount — it is never drawn as a figure.
 *
 * The draft lives in `store/refundDraft.ts` so uploads survive a detour to
 * Photos or a step back to the order — leaving never throws the draft away,
 * so there is no "discard?" question — and so the idempotency key belongs to the body as it stands: a retry
 * after a lost answer replays, an edit starts afresh.
 */
export default function RefundRequestScreen() {
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const router = useRouter();

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
  const quoteRead = useRefundDraft((state) => state.quote);
  const quoteNotice = useRefundDraft((state) => state.quoteNotice);
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
      if (useRefundDraft.getState().kind === "cancellation") await draft.loadQuote(orderId);
    } catch (caught) {
      setLoadError(refundErrorMessage(caught, "GRIDGO could not open this order. Check your connection and try again."));
    }
  }, [orderId]);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  const chooseKind = (value: RefundKind) => {
    setKind(value);
    const { quote } = useRefundDraft.getState();
    if (value === "cancellation" && orderId && (quote.phase === "idle" || quote.phase === "failed")) {
      void useRefundDraft.getState().loadQuote(orderId);
    }
  };

  const cancelling = kind === "cancellation";
  const quote = cancelling && quoteRead.phase === "ready" ? quoteRead.quote : null;
  const quoteProblem = !cancelling
    ? null
    : quoteRead.phase === "idle" || quoteRead.phase === "loading"
      ? "Working out what comes back…"
      : quoteRead.phase === "failed"
        ? "GRIDGO could not work out the refund. Try again above."
        : quoteRead.phase === "refused" && quoteRead.refusal.kind === "blocked"
          ? "This order cannot be cancelled from here."
          : null;
  const reasonProblem = checkRefundReason(reason);
  const destination = { qrFileId: qr?.phase === "stored" ? qr.fileId : null, provider, accountName, ownershipConfirmed: owned };
  const uploading = qr?.phase === "sending" || evidence.some((slot) => slot.phase === "sending");
  const missing = !kind
    ? "Choose what you are asking for."
    : quoteProblem
      ? quoteProblem
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
          evidenceFileIds: storedFileIds(evidence),
          destination: input,
          ...(quote ? { cancellationQuoteToken: quote.quoteToken } : {}),
        },
        draft.keyForSend(),
      );
      setConfirming(false);
      useRefundDraft.getState().reset();
      router.replace({ pathname: "/order/refund", params: { orderId, refundId: refund.id } });
    } catch (caught) {
      setConfirming(false);
      // The facts moved between the amount shown and the tap: show the new
      // amount and ask again. Never send it for them.
      if (caught instanceof api.ApiError && caught.message === "cancellation_quote_stale") {
        await useRefundDraft.getState().requote(orderId, quote);
        return;
      }
      const refusal = cancelling ? cancellationQuoteRefusal(caught) : null;
      if (refusal) useRefundDraft.getState().setQuoteRefusal(refusal);
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
  const quoteCopy = quote ? cancellationQuoteCopy(quote) : null;
  const refusal = cancelling && quoteRead.phase === "refused" ? quoteRead.refusal : null;
  const quoteFailure = cancelling && quoteRead.phase === "failed" ? quoteRead.message : null;
  const quoteLoading = cancelling && (quoteRead.phase === "idle" || quoteRead.phase === "loading");

  return (
    <FormScreen
      overlay={
        <ConfirmDialog
          visible={confirming}
          question={
            quote
              ? `Cancel ${order.title} and get back ${api.formatPhp(quote.refund.totalMinor)}?`
              : `Send a refund request for ${order.title}?`
          }
          body={
            quote
              ? "The job stops while Operations confirms it, then they send this amount by hand to your receiving QR. You can withdraw the request until they approve it."
              : refusal
                ? "The job pauses while Operations works out the amount. They tell you what comes back before they approve it, and you can withdraw until then."
                : "The job pauses while Operations reviews it. You can withdraw the request until they approve an amount."
          }
          confirmLabel={quote ? "Cancel and send" : "Send request"}
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
        {quoteNotice ? (
          <View className="gg-panel gap-1" accessibilityLiveRegion="polite">
            <Text className="text-body-lg font-medium text-text-primary">Check the amount again</Text>
            <Text className="text-body text-text-secondary">{quoteNotice}</Text>
          </View>
        ) : null}

        {quoteLoading ? (
          <View className="gap-3" accessibilityLabel="Working out your refund">
            <SkeletonLine width="w-3/4" height="h-7" />
            <SkeletonList count={1} />
          </View>
        ) : quoteFailure ? (
          <ErrorState
            label="Refund not worked out"
            body={quoteFailure}
            onRetry={() => void useRefundDraft.getState().loadQuote(order.id)}
          />
        ) : quote && quoteCopy ? (
          <View className="gap-3">
            <Text className="text-h1 text-text-primary">{quoteCopy.headline}</Text>
            <Text className="text-caption text-text-muted">For {order.title}</Text>
            <Text className="text-body-lg text-text-secondary">{quoteCopy.detail}</Text>
            <RefundBreakdownCard settlement={quote.refund} order={order} />
            <View className="gg-panel gap-3">
              {[
                "This is the exact amount. Sending the request fixes it, and Operations settles this amount, not a different one.",
                "The job stops the moment you send this, so nothing more is printed.",
                "Operations sends the money by hand to your receiving QR. It shows as Refunded once they record the transfer.",
              ].map((point) => (
                <View key={point} className="flex-row gap-3">
                  <View className="mt-2 h-1.5 w-1.5 rounded-pill bg-text-muted" />
                  <Text className="min-w-0 flex-1 text-body text-text-secondary">{point}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : refusal ? (
          <View className="gap-3">
            <Text className="text-h1 text-text-primary">
              {refusal.kind === "review" ? "Operations works out the amount" : "This order cannot be cancelled here"}
            </Text>
            <Text className="text-caption text-text-muted">For {order.title}</Text>
            <View className="gg-panel">
              <Text className="text-body text-text-secondary">{refusal.message}</Text>
            </View>
            {refusal.kind === "blocked" ? (
              <SecondaryButton label="Back to the order" onPress={() => router.back()} />
            ) : null}
          </View>
        ) : (
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
        )}

        <FormSection title="WHY">
          <FormField label="What you are asking for">
            <OptionPicker
              title="What are you asking for?"
              accessibilityLabel="What you are asking for"
              value={kind ?? ""}
              options={REFUND_KINDS}
              onChange={(value) => chooseKind(value as RefundKind)}
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
              placeholder={refundReasonPlaceholder(kind)}
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
              <EvidencePhotoList
                photos={evidence}
                max={MAX_REFUND_EVIDENCE}
                disabled={busy}
                onAdd={() => void addEvidence()}
                onRemove={removeEvidence}
              />
              <WhyWeAsk>These photos show Operations what went wrong, so they can decide your refund.</WhyWeAsk>
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
