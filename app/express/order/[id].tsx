import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

import { ErrorState } from "@/components/ErrorState";
import {
  ExpressHero,
  ExpressRail,
  FriendPassCard,
  PickupCodeCard,
  RatingCard,
  ShopCard,
} from "@/components/express/ExpressOrderCards";
import { Screen } from "@/components/Screen";
import { SkeletonLine, SkeletonPill } from "@/components/Skeleton";
import { useLiveRefresh } from "@/hooks/useLiveRefresh";
import { useServerNow } from "@/hooks/useVoucherClock";
import * as api from "@/lib/api";
import { userFacingError } from "@/lib/copy";
import { acceptCountdown, expressView } from "@/lib/expressOrder";
import { refundEntry } from "@/lib/refunds";
import { useExpressShops } from "@/store/expressShops";

/**
 * An Express order after Place order (gridgo-client#443): one hero, a
 * four-stop rail, and only what the client can use right now — cancel while
 * no shop has accepted, the counter code once ready, the rating and Friend
 * Pass when it is done. Everything else stays on the full order screen.
 */
export default function ExpressOrderScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [order, setOrder] = useState<api.Order | null>(null);
  const [refunds, setRefunds] = useState<api.Refund[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const now = useServerNow(1000);
  const shops = useExpressShops((state) => state.shops);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const [current, refundList] = await Promise.all([
        api.getOrder(id),
        api.listOrderRefunds(id).catch(() => null),
      ]);
      setOrder(current);
      setRefunds(refundList);
      setError(null);
    } catch (failure) {
      setError(userFacingError(failure, "This order did not load. Try again."));
    }
  }, [id]);

  useLiveRefresh(["orders", "dispatch"], load, { refreshOnFocus: false });
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const details = () => router.push({ pathname: "/order/[id]", params: { id: id ?? "", full: "1" } });

  if (error && !order) {
    return (
      <Screen edges={["bottom"]}>
        <View className="gg-page pt-6">
          <ErrorState label="Order not loaded" body={error} onRetry={() => void load()} />
        </View>
      </Screen>
    );
  }
  if (!order || !order.expressOrder) {
    return (
      <Screen edges={["bottom"]}>
        <View className="gg-page gap-3 pt-6" accessibilityRole="progressbar" accessibilityLabel="Loading your order">
          <SkeletonPill width="w-32" />
          <SkeletonLine width="w-3/4" height="h-7" />
          <SkeletonLine width="w-1/2" height="h-5" />
        </View>
      </Screen>
    );
  }

  const express = order.expressOrder;
  const pickup = order.fulfillmentMode !== "delivery";
  const known = express.currentSupplierId ? shops[express.currentSupplierId] : undefined;
  const view = expressView(order, known?.name ?? null);
  const refund = refundEntry(order, refunds, now);
  const countdown = view.phase === "sending" || view.phase === "moved" ? acceptCountdown(express.acceptBy, now) : null;
  const point = order.pickup ?? known?.location ?? null;
  const done = view.phase === "done";
  const windowOpen = order.state === "issue_window_open" || order.state === "delivered";
  const rateable = ["completed", "payout_released"].includes(order.state) && !order.rated;

  const confirm = async () => {
    setConfirming(true);
    try {
      setOrder(await api.confirmDelivery(order.id));
    } catch (failure) {
      setError(userFacingError(failure, "That did not go through. Try again."));
    } finally {
      setConfirming(false);
    }
  };

  return (
    <Screen edges={["bottom"]}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 24 }}>
        <ExpressHero phase={view.phase} title={view.title} line={view.line} countdown={countdown} />
        {view.railIndex != null ? <ExpressRail index={view.railIndex} pickup={pickup} /> : null}

        {view.phase === "ready" && express.pickupCode ? <PickupCodeCard code={express.pickupCode} /> : null}

        {view.phase !== "cancelled" && !done ? (
          <ShopCard
            name={known?.name ?? null}
            address={known?.address ?? null}
            point={pickup ? point : null}
            orderId={order.id}
            showMap={view.phase === "ready"}
            canMessage={!["checking", "sending", "moved"].includes(view.phase)}
          />
        ) : null}

        {view.phase === "on_the_way" ? (
          <Pressable onPress={details} accessibilityRole="button" className="gg-btn-secondary">
            <Text className="text-button text-text-primary">Track delivery</Text>
          </Pressable>
        ) : null}

        {view.cancellable && refund.kind === "eligible" ? (
          <Pressable
            onPress={() => router.push({ pathname: "/order/refund-request", params: { orderId: order.id } })}
            accessibilityRole="button"
            className="gg-btn-secondary"
          >
            <Text className="text-button text-text-primary">Cancel for free</Text>
          </Pressable>
        ) : null}

        {view.phase === "cancelled" && express.refundRequired && refund.kind === "eligible" ? (
          <Pressable
            onPress={() => router.push({ pathname: "/order/refund-request", params: { orderId: order.id } })}
            accessibilityRole="button"
            className="gg-btn-secondary"
          >
            <Text className="text-button text-text-primary">Get your money back</Text>
          </Pressable>
        ) : null}
        {refund.kind === "open" ? (
          <Pressable
            onPress={() => router.push({ pathname: "/order/refund", params: { orderId: order.id, refundId: refund.refund.id } })}
            accessibilityRole="button"
            className="gg-btn-secondary"
          >
            <Text className="text-button text-text-primary">See your refund</Text>
          </Pressable>
        ) : null}

        {done && windowOpen ? (
          <View className="gap-2">
            <Pressable onPress={() => void confirm()} disabled={confirming} accessibilityRole="button" className="gg-btn-secondary">
              <Text className="text-button text-text-primary">{confirming ? "Saving…" : "All good"}</Text>
            </Pressable>
            <Pressable onPress={details} accessibilityRole="link" className="min-h-11 items-center justify-center">
              <Text className="text-body font-medium text-text-primary underline">Something wrong? Report a problem</Text>
            </Pressable>
          </View>
        ) : null}
        {done && rateable ? <RatingCard orderId={order.id} onRated={() => setOrder({ ...order, rated: true })} /> : null}
        {done ? <FriendPassCard /> : null}

        <Pressable onPress={details} accessibilityRole="link" className="min-h-11 items-center justify-center">
          <Text className="text-body text-text-secondary underline">Order details</Text>
        </Pressable>
      </ScrollView>
    </Screen>
  );
}
