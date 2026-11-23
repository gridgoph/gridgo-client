import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import { useCallback, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

import { ErrorState } from "@/components/ErrorState";
import { FormScreen } from "@/components/FormScreen";
import {
  ExpressHero,
  ExpressRail,
  FriendPassCard,
  PickupCodeCard,
  RatingCard,
  ShopCard,
} from "@/components/express/ExpressOrderCards";
import { GuideTarget } from "@/components/GuideTarget";
import { PaymentPanel } from "@/components/PaymentPanel";
import { Screen } from "@/components/Screen";
import { SkeletonLine, SkeletonPill } from "@/components/Skeleton";
import { useLiveRefresh } from "@/hooks/useLiveRefresh";
import { useThemeColors } from "@/hooks/useTheme";
import { useServerNow } from "@/hooks/useVoucherClock";
import * as api from "@/lib/api";
import { userFacingError } from "@/lib/copy";
import { GUIDE_SAMPLE_ORDER_ID, SAMPLE_PICKUP_CODE, SAMPLE_SHOP } from "@/lib/expressGuide";
import { acceptCountdown, expressView } from "@/lib/expressOrder";
import { refundEntry } from "@/lib/refunds";
import { payCountdown } from "@/lib/whoPrints";
import { useExpress } from "@/store/express";
import { useExpressShops } from "@/store/expressShops";

/**
 * An Express order after Place order (gridgo-client#443): one hero, a
 * four-stop rail, and only what the client can use right now — cancel while
 * no shop has accepted, the counter code once ready, the rating and Friend
 * Pass when it is done. Everything else stays on the full order screen.
 */
export default function ExpressOrderRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return id === GUIDE_SAMPLE_ORDER_ID ? <SampleExpressOrder /> : <ExpressOrderScreen />;
}

/**
 * How to order's last tip (gridgo-client#441): a ready order drawn from
 * sample data with the real cards. Nothing here is read from GRIDGO.
 */
function SampleExpressOrder() {
  return (
    <Screen edges={["bottom"]}>
      <Stack.Screen options={{ gestureEnabled: false }} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 24 }}>
        <ExpressHero phase="ready" title="Ready!" line={`Show this code at ${SAMPLE_SHOP.name}.`} countdown={null} />
        <ExpressRail index={2} pickup />
        <GuideTarget step="express.pickup">
          <PickupCodeCard code={SAMPLE_PICKUP_CODE} />
        </GuideTarget>
        <ShopCard
          name={SAMPLE_SHOP.name}
          address={SAMPLE_SHOP.address}
          point={null}
          orderId={GUIDE_SAMPLE_ORDER_ID}
          showMap={false}
          canMessage={false}
        />
      </ScrollView>
    </Screen>
  );
}

function ExpressOrderScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [order, setOrder] = useState<api.Order | null>(null);
  const [refunds, setRefunds] = useState<api.Refund[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [justRated, setJustRated] = useState(false);
  const [repicking, setRepicking] = useState(false);
  const [repickError, setRepickError] = useState<string | null>(null);
  const now = useServerNow(1000);
  const shops = useExpressShops((state) => state.shops);
  const colors = useThemeColors();

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const [current, refundList] = await Promise.all([
        api.getOrder(id),
        api.listOrderRefunds(id).catch(() => null),
      ]);
      // Not (or no longer) an Express order: the full order screen has it all.
      if (!current.expressOrder) {
        router.replace({ pathname: "/order/[id]", params: { id: current.id, full: "1" } });
        return;
      }
      setOrder(current);
      setRefunds(refundList);
      setError(null);
    } catch (failure) {
      setError(userFacingError(failure, "This order did not load. Try again."));
    }
  }, [id, router]);

  useLiveRefresh(["orders", "dispatch"], load, { refreshOnFocus: false });
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  // Opened from a link or after Place order replaced the flow: no stack to go
  // back through, so the header leads to Orders (same rule as order/[id]).
  const headerEscape = !router.canGoBack() ? (
    <Stack.Screen
      options={{
        headerLeft: () => (
          <Pressable
            onPress={() => router.replace("/(tabs)/orders")}
            accessibilityRole="button"
            accessibilityLabel="Back to orders"
            hitSlop={12}
            className="flex-row items-center gap-1 pr-3"
          >
            <ChevronLeft size={24} color={colors.textPrimary} strokeWidth={2} />
            <Text className="text-body-lg text-text-primary">Orders</Text>
          </Pressable>
        ),
      }}
    />
  ) : null;

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
  const view = expressView(order, known?.name ?? null, now);
  const payLeft = view.phase === "pay_now" ? (payCountdown(express.payBy, now)?.label ?? null) : null;
  const canRepick = view.phase === "repick" || view.phase === "pay_expired";
  const refund = refundEntry(order, refunds, now);
  const countdown = view.phase === "sending" || view.phase === "moved" ? acceptCountdown(express.acceptBy, now) : null;
  const point = order.pickup ?? known?.location ?? null;
  const done = view.phase === "done";
  const windowOpen = order.state === "issue_window_open" || order.state === "delivered";
  const rateable = ["completed", "payout_released"].includes(order.state) && !order.rated;

  // Same files and settings, back on "Who prints it?" (A3 never moves by itself).
  const repick = async () => {
    setRepicking(true);
    setRepickError(null);
    const failure = await useExpress.getState().startRepick(order);
    setRepicking(false);
    if (failure) {
      setRepickError(failure);
      return;
    }
    router.push("/express");
  };

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

  // FormScreen, not a ScrollView: an A3 order asks for the payment reference here.
  return (
    <FormScreen contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 24 }}>
      {headerEscape}
      <ExpressHero phase={view.phase} title={view.title} line={view.line} countdown={countdown} payCountdown={payLeft} />
      {view.railIndex != null ? <ExpressRail index={view.railIndex} pickup={pickup} /> : null}

      {view.phase === "pay_now" ? (
        <PaymentPanel order={order} installment="downpayment" onSubmitted={setOrder} />
      ) : null}
      {canRepick ? (
        <View className="gap-2">
          <Pressable
            onPress={() => void repick()}
            disabled={repicking}
            accessibilityRole="button"
            accessibilityState={{ disabled: repicking }}
            className={repicking ? "gg-btn-primary gg-disabled" : "gg-btn-primary"}
          >
            <Text className="text-button text-action-yellow-on">
              {repicking ? "Opening your files…" : "Pick a printer"}
            </Text>
          </Pressable>
          {repickError ? (
            <Text className="text-caption text-error" accessibilityRole="alert">
              {repickError}
            </Text>
          ) : null}
        </View>
      ) : null}

      {view.phase === "ready" && express.pickupCode ? <PickupCodeCard code={express.pickupCode} /> : null}

      {view.phase !== "cancelled" && !done && !canRepick ? (
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
          <Pressable
            onPress={() => void confirm()}
            disabled={confirming}
            accessibilityRole="button"
            className="gg-btn-secondary"
          >
            <Text className="text-button text-text-primary">{confirming ? "Saving…" : "All good"}</Text>
          </Pressable>
          <Pressable onPress={details} accessibilityRole="link" className="min-h-11 items-center justify-center">
            <Text className="text-body font-medium text-text-primary underline">Something wrong? Report a problem</Text>
          </Pressable>
        </View>
      ) : null}
      {done && rateable ? (
        <RatingCard
          orderId={order.id}
          onRated={() => {
            setJustRated(true);
            setOrder({ ...order, rated: true });
          }}
        />
      ) : null}
      {justRated ? (
        <Text className="text-body text-text-secondary" accessibilityLiveRegion="polite">
          Thanks. Your rating is in.
        </Text>
      ) : null}
      {done ? <FriendPassCard /> : null}

      <Pressable onPress={details} accessibilityRole="link" className="min-h-11 items-center justify-center">
        <Text className="text-body text-text-secondary underline">Order details</Text>
      </Pressable>
    </FormScreen>
  );
}
