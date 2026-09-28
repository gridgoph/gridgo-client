import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { Text, View } from "react-native";

import { ConfirmDialog } from "@/components/ConfirmDialog";
import { ErrorState } from "@/components/ErrorState";
import { FormScreen } from "@/components/FormScreen";
import { RefundBreakdownCard } from "@/components/refund/RefundBreakdownCard";
import { RefundImage } from "@/components/refund/RefundImage";
import { RefundStageRail } from "@/components/refund/RefundStageRail";
import { SecondaryButton } from "@/components/SecondaryButton";
import { SkeletonLine, SkeletonList, SkeletonPill } from "@/components/Skeleton";
import { SpecRow } from "@/components/SpecRow";
import { StatusChip } from "@/components/StatusChip";
import { useLiveRefresh } from "@/hooks/useLiveRefresh";
import * as api from "@/lib/api";
import { formatPhp } from "@/lib/api";
import { refundErrorMessage } from "@/lib/copy";
import { formatDeadline } from "@/lib/deadline";
import {
  canReplaceDestination,
  canWithdrawRefund,
  currentRefund,
  refundHeadline,
  refundHistoryRow,
  refundKindLabel,
  refundProviderLabel,
  refundRejectionReason,
  refundStatusMeta,
} from "@/lib/refunds";
import { formatTimelineStamp } from "@/lib/relativeTime";

/**
 * One order's refund: where it stands, what comes back, where it goes, and
 * what has happened to it.
 *
 * The screen leads with the one question a client has — has my money moved?
 * — and keeps "approved" and "sent" visibly apart all the way down: the rail
 * has a Sent stop of its own, the chip on an approved refund carries a clock,
 * and the transfer section only exists once Operations has recorded one.
 * There is no yellow here. The client has nothing to do but wait, and the
 * two things they can do (change the receiving QR, withdraw) are quiet.
 */
export default function RefundScreen() {
  const { orderId, refundId } = useLocalSearchParams<{ orderId: string; refundId?: string }>();
  const router = useRouter();
  const [order, setOrder] = useState<api.Order | null>(null);
  const [refund, setRefund] = useState<api.Refund | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [withdrawing, setWithdrawing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const withdrawKey = useRef<string | null>(null);
  const sequence = useRef(0);

  const load = useCallback(async () => {
    if (!orderId) return;
    const current = ++sequence.current;
    try {
      const [nextOrder, refunds] = await Promise.all([api.getOrder(orderId), api.listOrderRefunds(orderId)]);
      if (current !== sequence.current) return;
      setOrder(nextOrder);
      setRefund(refunds.find((row) => row.id === refundId) ?? currentRefund(refunds));
      setError(null);
    } catch (caught) {
      if (current !== sequence.current) return;
      setError(refundErrorMessage(caught, "GRIDGO could not load this refund. Check your connection and try again."));
    } finally {
      if (current === sequence.current) setLoaded(true);
    }
  }, [orderId, refundId]);

  // Refund events invalidate orders, payouts and claims.
  useLiveRefresh(["orders", "payouts", "claims"], load, { refreshOnFocus: false });
  useFocusEffect(
    useCallback(() => {
      void load();
      return () => { sequence.current++; };
    }, [load]),
  );

  const withdraw = async () => {
    if (!refund) return;
    setBusy(true);
    setActionError(null);
    try {
      withdrawKey.current ??= api.newIdempotencyKey();
      const updated = await api.withdrawRefund(
        refund.id,
        { expectedVersion: refund.version, reason: "The client withdrew the request in the app." },
        withdrawKey.current,
      );
      withdrawKey.current = null;
      setRefund(updated);
      setWithdrawing(false);
    } catch (caught) {
      setWithdrawing(false);
      setActionError(refundErrorMessage(caught, "The request was not withdrawn. Check your connection and try again."));
      void load();
    } finally {
      setBusy(false);
    }
  };

  if (!loaded && !refund) {
    return (
      <FormScreen>
        <View className="gg-page gap-4 pt-4" accessibilityLabel="Loading your refund">
          <SkeletonPill width="w-40" />
          <SkeletonLine width="w-3/4" height="h-7" />
          <SkeletonLine width="w-1/2" height="h-5" />
          <View className="mt-4">
            <SkeletonList count={2} />
          </View>
        </View>
      </FormScreen>
    );
  }

  if (!refund || !order) {
    return (
      <FormScreen>
        <View className="gg-page gap-3 pt-4">
          {error ? (
            <ErrorState label="Could not load refund" body={error} onRetry={() => void load()} />
          ) : (
            <Text className="text-body text-text-secondary">
              There is no refund request on this order.
            </Text>
          )}
          <SecondaryButton label="Back to the order" onPress={() => router.back()} />
        </View>
      </FormScreen>
    );
  }

  const meta = refundStatusMeta(refund.status);
  const { headline, detail } = refundHeadline(refund);
  const rejection = refundRejectionReason(refund);
  const history = [...refund.history].reverse().map(refundHistoryRow);

  return (
    <FormScreen>
      <View className="gg-page gap-8 pb-16 pt-4">
        <View className="gap-3">
          <View className="flex-row">
            <StatusChip tone={meta.tone} label={meta.label} icon={meta.icon} />
          </View>
          <Text className="text-h1 text-text-primary">{headline}</Text>
          <Text className="text-body-lg text-text-secondary">{detail}</Text>
          <Text className="text-caption text-text-muted">For {order.title}</Text>
        </View>

        <RefundStageRail status={refund.status} />

        {error ? <ErrorState label="Not up to date" body={error} onRetry={() => void load()} /> : null}
        {actionError ? <ErrorState label="Not done" body={actionError} /> : null}

        {rejection ? (
          <View className="gap-3">
            <Text className="text-overline text-text-muted">WHY IT WAS NOT APPROVED</Text>
            <View className="gg-card gap-3">
              <Text className="text-body text-text-primary">{rejection}</Text>
            </View>
            <SecondaryButton label="Message GRIDGO support" onPress={() => router.push("/chat")} />
          </View>
        ) : null}

        {refund.settlement ? (
          <View className="gap-3">
            <Text className="text-overline text-text-muted">WHAT COMES BACK</Text>
            <RefundBreakdownCard settlement={refund.settlement} order={order} />
            {refund.settlement.reason.trim() ? (
              <View className="gg-panel gap-1">
                <Text className="text-caption text-text-muted">
                  Operations&apos; note · approved {formatTimelineStamp(refund.settlement.approvedAt)}
                </Text>
                <Text className="text-body text-text-primary">{refund.settlement.reason}</Text>
              </View>
            ) : null}
          </View>
        ) : null}

        {refund.payment ? (
          <View className="gap-3">
            <Text className="text-overline text-text-muted">THE TRANSFER</Text>
            <View className="gg-card gap-3">
              <Text className="text-body-lg font-medium text-text-primary">
                {refund.payment.evidenceLabel || "Wallet transfer evidence"}
              </Text>
              <RefundImage fileId={refund.payment.receiptFileId} alt="Wallet transfer evidence" />
              <View>
                <SpecRow label="Amount sent" value={formatPhp(refund.payment.amountMinor)} />
                <SpecRow label="Sent" value={formatTimelineStamp(refund.payment.paidAt)} />
                <SpecRow label="Wallet reference" value={refund.payment.reference} />
              </View>
              <Text className="text-caption text-text-muted">
                A screenshot of the transfer from GRIDGO&apos;s wallet, recorded by Operations. It is
                evidence that the money was sent — not an official receipt.
              </Text>
            </View>
          </View>
        ) : null}

        <View className="gap-3">
          <Text className="text-overline text-text-muted">YOUR RECEIVING ACCOUNT</Text>
          {refund.destination ? (
            <View className="gg-card gap-3">
              <RefundImage fileId={refund.destination.qrFileId} alt="Your receiving QR" />
              <View>
                <SpecRow label="Wallet" value={refundProviderLabel(refund.destination.provider)} />
                <SpecRow label="Name on the account" value={refund.destination.accountName} />
              </View>
              <Text className="text-caption text-text-muted">
                You confirmed this account is yours. Only you and GRIDGO Operations can see it.
              </Text>
            </View>
          ) : (
            <Text className="text-body text-text-secondary">
              No receiving QR yet. Operations cannot send a refund until you add one.
            </Text>
          )}
          {canReplaceDestination(refund) ? (
            <SecondaryButton
              label={refund.destination ? "Change receiving QR" : "Add receiving QR"}
              onPress={() =>
                router.push({
                  pathname: "/order/refund-account",
                  params: { orderId: order.id, refundId: refund.id },
                })
              }
            />
          ) : null}
        </View>

        <View className="gap-3">
          <Text className="text-overline text-text-muted">YOUR REQUEST</Text>
          <View className="gg-card gap-3">
            <View className="gap-1">
              <Text className="text-body-lg font-medium text-text-primary">{refundKindLabel(refund.kind)}</Text>
              <Text className="text-caption text-text-muted">
                Sent {formatTimelineStamp(refund.createdAt)}
                {refund.filingDeadlineAt ? ` · deadline was ${formatDeadline(refund.filingDeadlineAt)}` : ""}
              </Text>
            </View>
            <Text className="text-body text-text-primary">{refund.reason}</Text>
            {refund.evidenceFileIds.length ? (
              <View className="flex-row flex-wrap gap-2">
                {refund.evidenceFileIds.map((fileId, index) => (
                  <RefundImage key={fileId} fileId={fileId} alt={`Photo ${index + 1} you sent`} size="thumb" />
                ))}
              </View>
            ) : null}
          </View>
          {canWithdrawRefund(refund) ? (
            <SecondaryButton label="Withdraw request" disabled={busy} onPress={() => setWithdrawing(true)} />
          ) : null}
        </View>

        {history.length ? (
          <View className="gap-3">
            <Text className="text-overline text-text-muted">HISTORY</Text>
            <View className="gg-card">
              {history.map((row, index) => (
                <View
                  key={`${row.at}-${index}`}
                  className={
                    index === history.length - 1
                      ? "flex-row items-baseline justify-between gap-3 py-3"
                      : "flex-row items-baseline justify-between gap-3 border-b border-outline-subtle py-3"
                  }
                >
                  <Text className="min-w-0 flex-1 text-body text-text-primary">{row.label}</Text>
                  <Text className="text-caption text-text-muted">{formatTimelineStamp(row.at)}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}
      </View>

      <ConfirmDialog
        visible={withdrawing}
        question="Withdraw this refund request?"
        body="The job carries on as it was and nothing is refunded. You can ask again while the time to ask is still open."
        confirmLabel="Withdraw request"
        cancelLabel="Keep it"
        tone="destructive"
        busy={busy}
        onConfirm={() => void withdraw()}
        onCancel={() => setWithdrawing(false)}
      />
    </FormScreen>
  );
}
