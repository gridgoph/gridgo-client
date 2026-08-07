import { useCallback, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { IssueWindowCard } from "@/components/IssueWindowCard";
import { OrderTimeline } from "@/components/OrderTimeline";
import { PaymentPanel } from "@/components/PaymentPanel";
import { ProductPreview } from "@/components/ProductPreview";
import { ProofActions } from "@/components/ProofActions";
import { SpecRow } from "@/components/SpecRow";
import { StatusChip } from "@/components/StatusChip";
import * as api from "@/lib/api";
import { formatPhp } from "@/lib/api";
import { formatPaymentSummary, userFacingError, zoneLabel } from "@/lib/copy";
import {
  getOrderStateMeta,
  isAwaitingPaymentState,
  isClientCorrectionState,
  isIssueWindowState,
  isProofApprovalState,
  isTrackingState,
  orderGrandTotalMinor,
} from "@/lib/orderState";
import { useThemeColors } from "@/hooks/useTheme";

/**
 * Order detail: specs, timeline, proof/payment actions, issue window.
 * Delivery tracking is watch-only; live location is not on the client API yet.
 */
export default function OrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const colors = useThemeColors();
  const [order, setOrder] = useState<api.Order | null>(null);
  const [otherOrders, setOtherOrders] = useState<api.Order[]>([]);
  const [balance, setBalance] = useState(0);
  const [family, setFamily] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const [o, list, credits, catalog] = await Promise.all([
        api.getOrder(id),
        api.listOrders(),
        api.creditBalance(),
        api.listCatalog(),
      ]);
      setOrder(o);
      setOtherOrders(list.filter((x) => x.id !== o.id));
      setBalance(credits.balanceMinor);
      setFamily(catalog.find((p) => p.id === o.productId)?.family ?? null);
      setError(null);
    } catch (e) {
      setError(userFacingError(e, "Could not load this order. Go back to Orders and try again."));
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (error && !order) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }} edges={["top"]}>
        <View className="gg-page gap-4 pt-6">
          <StatusChip tone="error" label="Could not load order" icon="circle-x" />
          <Text className="text-body text-error">{error}</Text>
          <Pressable
            onPress={() => router.back()}
            accessibilityRole="button"
            className="gg-btn-secondary"
          >
            <Text className="text-button text-text-primary">Back to orders</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (!order) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }} edges={["top"]}>
        <View className="gg-page pt-6">
          <Text className="text-body text-text-muted">Loading order…</Text>
        </View>
      </SafeAreaView>
    );
  }

  const meta = getOrderStateMeta(order.state);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }} edges={["bottom"]}>
      <ScrollView className="gg-screen">
        <View className="gg-page gap-6 pb-12 pt-4">
          <View className="gap-2">
            <StatusChip tone={meta.tone} label={meta.label} icon={meta.icon} />
            <Text className="text-h2 text-text-primary">{order.title}</Text>
          </View>

          <View className="gg-card">
            <SpecRow label="Quantity" value={String(order.quantity)} />
            <SpecRow label="Size" value={order.size || "—"} />
            <SpecRow label="Material" value={order.material || "—"} />
            <SpecRow
              label="Deadline"
              value={
                order.deadline
                  ? new Date(order.deadline).toLocaleString("en-PH")
                  : "—"
              }
            />
            <SpecRow label="Address" value={order.address || "—"} />
            <SpecRow label="Area" value={zoneLabel(order.zone)} />
            <SpecRow label="Artwork" value={order.artworkName || "—"} />
            <SpecRow label="Print total" value={formatPhp(order.totalMinor)} />
            <SpecRow label="Delivery" value={formatPhp(order.deliveryFeeMinor)} />
            <SpecRow label="Grand total" value={formatPhp(orderGrandTotalMinor(order))} />
            <SpecRow
              label="Payment"
              value={formatPaymentSummary(order.paymentMethod, order.paymentStatus)}
            />
          </View>

          <ProductPreview
            family={family}
            artworkName={order.artworkName}
            productName={order.title}
            size={order.size}
          />

          {(isProofApprovalState(order.state) || isClientCorrectionState(order.state)) && (
            <ProofActions order={order} onUpdated={setOrder} />
          )}

          {isAwaitingPaymentState(order.state) && (
            <PaymentPanel
              order={order}
              balanceMinor={balance}
              otherOrders={otherOrders}
              onPaid={(next) => {
                setOrder(next);
                void api.creditBalance().then((c) => setBalance(c.balanceMinor));
              }}
            />
          )}

          {isIssueWindowState(order.state) && <IssueWindowCard order={order} />}

          {isTrackingState(order.state) && (
            <View className="gg-card gap-2">
              <Text className="text-h3 text-text-primary">Delivery</Text>
              <StatusChip tone={meta.tone} label={meta.label} icon={meta.icon} />
              <Text className="text-body text-text-secondary">
                You can watch this delivery here; you cannot change the rider or route.
                Live location and ETA are not available in this pilot yet — when they
                are, this card will show the rider, last updated time, and whether the
                location is stale.
              </Text>
            </View>
          )}

          <View className="gg-card gap-4">
            <Text className="text-h3 text-text-primary">Timeline</Text>
            <Text className="text-caption text-text-muted">
              Who acted, when, and what changed.
            </Text>
            <OrderTimeline timeline={order.timeline} currentState={order.state} />
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
