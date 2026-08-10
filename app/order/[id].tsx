import { useCallback, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import Animated, { FadeIn } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";

import { CorrectionCard } from "@/components/CorrectionCard";
import { ErrorState } from "@/components/ErrorState";
import { DeliveryTrackingCard } from "@/components/DeliveryTrackingCard";
import { IssueWindowCard } from "@/components/IssueWindowCard";
import { OrderTimeline } from "@/components/OrderTimeline";
import { PaymentPanel } from "@/components/PaymentPanel";
import { ProductPreview } from "@/components/ProductPreview";
import { ProofDecision } from "@/components/ProofDecision";
import { SecondaryButton } from "@/components/SecondaryButton";
import { SkeletonList } from "@/components/Skeleton";
import { SpecRow } from "@/components/SpecRow";
import { StatusChip } from "@/components/StatusChip";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { useThemeColors } from "@/hooks/useTheme";
import * as api from "@/lib/api";
import { formatPhp } from "@/lib/api";
import { formatPaymentSummary, userFacingError } from "@/lib/copy";
import { formatDeadline } from "@/lib/deadline";
import {
  getOrderStateMeta,
  isAnyProofDecisionState,
  isAwaitingPaymentState,
  isClientCorrectionState,
  isIssueWindowState,
  isTrackingState,
  orderGrandTotalMinor,
  orderNextAction,
  orderWaitingOn,
} from "@/lib/orderState";
import { describeQuantity } from "@/lib/quantity";
import { zoneName, type Zone } from "@/lib/zones";

/**
 * One print job, end to end.
 *
 * The screen opens with what is happening and what — if anything — the client
 * has to do about it. Exactly one action zone renders at a time, so the single
 * yellow control is always the real next step. Everything below it is the
 * record: the specification agreed, and who did what, when.
 */
export default function OrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const colors = useThemeColors();
  const reducedMotion = useReducedMotion();

  const [order, setOrder] = useState<api.Order | null>(null);
  const [otherOrders, setOtherOrders] = useState<api.Order[]>([]);
  const [balance, setBalance] = useState(0);
  const [product, setProduct] = useState<api.CatalogProduct | null>(null);
  const [zones, setZones] = useState<Zone[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const [current, list, credits, catalog, zoneList] = await Promise.all([
        api.getOrder(id),
        api.listOrders(),
        api.creditBalance(),
        api.listCatalog(),
        api.listZones().catch(() => [] as Zone[]),
      ]);
      setOrder(current);
      setOtherOrders(list.filter((entry) => entry.id !== current.id));
      setBalance(credits.balanceMinor);
      setProduct(catalog.find((entry) => entry.id === current.productId) ?? null);
      setZones(zoneList);
      setError(null);
    } catch (e) {
      setError(
        userFacingError(e, "Could not load this order. Go back to Orders and open it again."),
      );
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (error && !order) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }} edges={["bottom"]}>
        <View className="gg-page gap-3 pt-6">
          <ErrorState label="Could not load order" body={error} onRetry={() => void load()} />
          <SecondaryButton label="Back to orders" onPress={() => router.back()} />
        </View>
      </SafeAreaView>
    );
  }

  if (!order) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }} edges={["bottom"]}>
        <View className="gg-page gap-4 pt-6">
          <Text className="text-body text-text-muted">Loading this order…</Text>
          <SkeletonList count={3} />
        </View>
      </SafeAreaView>
    );
  }

  const meta = getOrderStateMeta(order.state);
  const nextAction = orderNextAction(order.state);
  const waitingOn = orderWaitingOn(order.state);
  const unit = product?.unit ?? "";
  const family = product?.family ?? null;
  const artworkFileId = order.artworkFileIds?.[order.artworkFileIds.length - 1] ?? null;
  const showsOwnPreview = isAnyProofDecisionState(order.state);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }} edges={["bottom"]}>
      <ScrollView className="gg-screen">
        <View className="gg-page gap-8 pb-16 pt-4">
          <View className="gap-3">
            {/* A chip hugs its label — stretched to the column width it reads
                as a banner, and its border stops meaning "this one thing". */}
            <View className="flex-row">
              <StatusChip tone={meta.tone} label={meta.label} icon={meta.icon} />
            </View>
            <Text className="text-h1 text-text-primary">{order.title}</Text>
            {/* Only when nothing is waiting on the client. When an action zone
                renders below, it owns the instruction and the reason — saying
                either of them up here as well is filler. */}
            {!nextAction ? (
              <Text className="text-body-lg text-text-secondary">
                {waitingOn ?? "This job is in progress."}
              </Text>
            ) : null}
          </View>

          {/* One action zone at a time — the single yellow control lives here. */}
          <Animated.View
            key={order.state}
            entering={reducedMotion ? undefined : FadeIn.duration(200)}
          >
            {isAnyProofDecisionState(order.state) ? (
              <ProofDecision
                order={order}
                family={family}
                unit={unit}
                onUpdated={setOrder}
              />
            ) : isClientCorrectionState(order.state) ? (
              <CorrectionCard order={order} onUpdated={setOrder} />
            ) : isAwaitingPaymentState(order.state) ? (
              <PaymentPanel
                order={order}
                balanceMinor={balance}
                otherOrders={otherOrders}
                onPaid={(next) => {
                  setOrder(next);
                  void api.creditBalance().then((c) => setBalance(c.balanceMinor));
                }}
              />
            ) : isIssueWindowState(order.state) ? (
              <IssueWindowCard order={order} />
            ) : null}
          </Animated.View>

          {isTrackingState(order.state) ? <DeliveryTrackingCard order={order} /> : null}

          <View className="gap-4">
            <Text className="text-overline text-text-muted">SPECIFICATION</Text>
            <View className="gg-card">
              <SpecRow label="Quantity" value={describeQuantity(order.quantity, unit)} />
              <SpecRow label="Size" value={order.size || "—"} />
              <SpecRow label="Material" value={order.material || "—"} />
              {order.finish ? <SpecRow label="Finish" value={order.finish} /> : null}
              <SpecRow label="Deadline" value={formatDeadline(order.deadline)} />
              {order.promisedDate ? (
                <SpecRow label="Supplier promised" value={formatDeadline(order.promisedDate)} />
              ) : null}
              <SpecRow label="Deliver to" value={order.address || "—"} />
              <SpecRow label="Area" value={zoneName(zones, order.zone)} />
              <SpecRow label="Artwork" value={order.artworkName || "Not uploaded"} />
            </View>

            <View className="gg-card">
              <SpecRow label="Print" value={formatPhp(order.totalMinor)} />
              <SpecRow label="Delivery" value={formatPhp(order.deliveryFeeMinor)} />
              <SpecRow
                label="Payment"
                value={formatPaymentSummary(order.paymentMethod, order.paymentStatus)}
              />
              <View className="flex-row items-baseline justify-between gap-4 pt-3">
                <Text className="text-body-lg text-text-secondary">Total</Text>
                <Text className="text-h3 text-text-primary">
                  {formatPhp(orderGrandTotalMinor(order))}
                </Text>
              </View>
            </View>
          </View>

          {!showsOwnPreview ? (
            <ProductPreview
              family={family}
              artworkName={order.artworkName}
              productName={order.title}
              size={order.size}
              artworkFileId={artworkFileId}
            />
          ) : null}

          <View className="gap-4">
            <Text className="text-overline text-text-muted">HISTORY</Text>
            <View className="gg-card">
              <OrderTimeline timeline={order.timeline} currentState={order.state} />
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
