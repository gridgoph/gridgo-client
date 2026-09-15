import { useLiveRefresh } from "@/hooks/useLiveRefresh";
import { ChevronLeft } from "lucide-react-native";
import { useCallback, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import Animated, { FadeIn } from "react-native-reanimated";
import { Screen } from "@/components/Screen";

import { CorrectionCard } from "@/components/CorrectionCard";
import { ErrorState } from "@/components/ErrorState";
import { DeliveryTrackingCard } from "@/components/DeliveryTrackingCard";
import { PickupCounterCard } from "@/components/PickupCounterCard";
import { FormScreen } from "@/components/FormScreen";
import { FulfilmentProgress } from "@/components/FulfilmentProgress";
import { IssueWindowCard } from "@/components/IssueWindowCard";
import { OrderTimeline } from "@/components/OrderTimeline";
import { PaymentPanel, PaymentUnderReviewCard } from "@/components/PaymentPanel";
import { PrimaryButton } from "@/components/PrimaryButton";
import { ProductPreview } from "@/components/ProductPreview";
import { ProofDecision } from "@/components/ProofDecision";
import { PushEnableCard } from "@/components/PushEnableCard";
import { SecondaryButton } from "@/components/SecondaryButton";
import { SkeletonLine, SkeletonList, SkeletonPill } from "@/components/Skeleton";
import { SpecRow } from "@/components/SpecRow";
import { StatusChip } from "@/components/StatusChip";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { useThemeColors } from "@/hooks/useTheme";
import * as api from "@/lib/api";
import { formatPhp } from "@/lib/api";
import { installmentStatusLabel, userFacingError } from "@/lib/copy";
import { formatDeadline } from "@/lib/deadline";
import {
  collectsAtOffice,
  formatPriceRange,
  getOrderStateMeta,
  isAwaitingCollectionState,
  isClientCorrectionState,
  isIssueWindowState,
  isProofApprovalState,
  isTrackingState,
  orderNextAction,
  orderTotalMinor,
  orderWaitingOn,
  showsFulfilmentProgress,
} from "@/lib/orderState";
import { installmentUnderReview, payableInstallment } from "@/lib/payment";
import { canRate } from "@/lib/rating";
import { describeQuantity } from "@/lib/quantity";
import { EMPTY_TAXONOMY, taxonomyLabel, type Taxonomy } from "@/lib/taxonomy";
import { zoneName, type Zone } from "@/lib/zones";

/**
 * One print job, end to end.
 *
 * The screen opens with what is happening and what — if anything — the client
 * has to do about it. Exactly one action zone renders at a time, so the single
 * yellow control is always the real next step. Everything below it is the
 * record: the specification agreed, the money as the client is owed it, and
 * who did what, when.
 */
export default function OrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const colors = useThemeColors();
  const reducedMotion = useReducedMotion();

  const [order, setOrder] = useState<api.Order | null>(null);
  const [product, setProduct] = useState<api.CatalogProduct | null>(null);
  const [zones, setZones] = useState<Zone[]>([]);
  const [taxonomy, setTaxonomy] = useState<Taxonomy>(EMPTY_TAXONOMY);
  const [error, setError] = useState<string | null>(null);

  const loadSequence = useRef(0);
  const applyOrderUpdate = useCallback((updated: api.Order) => {
    loadSequence.current++;
    setOrder(updated);
    setError(null);
  }, []);
  const load = useCallback(async () => {
    const sequence = ++loadSequence.current;
    if (!id) return;
    try {
      const [current, catalog, zoneList, taxonomyResult] = await Promise.all([
        api.getOrder(id),
        api.listCatalog(),
        api.listZones().catch(() => [] as Zone[]),
        // Labels only. A failure costs a nicer material name, never the order.
        api.getTaxonomy().catch(() => EMPTY_TAXONOMY),
      ]);
      if (sequence !== loadSequence.current) return;
      setOrder(current);
      setProduct(catalog.find((entry) => entry.id === current.productId) ?? null);
      setZones(zoneList);
      setTaxonomy(taxonomyResult);
      setError(null);
    } catch (e) {
      if (sequence !== loadSequence.current) return;
      setError(
        userFacingError(e, "Could not load this order. Go back to Orders and open it again."),
      );
    }
  }, [id]);

  useLiveRefresh(["orders", "dispatch", "claims"], load, { refreshOnFocus: false });

  useFocusEffect(
    useCallback(() => {
      void load();
      return () => { loadSequence.current++; };
    }, [load]),
  );

  /*
    An order can be opened with nothing behind it — a notification tap, a deep
    link, a cold start on this route. The native stack hides its own back
    control when there is no history, and this screen is not a tab, so without
    this the client would be left with only OS gestures. `replace` rather than
    `push`, because there is no stack to grow.
  */
  const exitToOrders = () => router.replace("/(tabs)/orders");
  const stranded = !router.canGoBack();
  const headerEscape = stranded ? (
    <Stack.Screen
      options={{
        headerLeft: () => (
          <Pressable
            onPress={exitToOrders}
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

  if (error && !order) {
    return (
      <Screen edges={["bottom"]}>
        {headerEscape}
        <View className="gg-page gap-3 pt-6">
          <ErrorState label="Could not load order" body={error} onRetry={() => void load()} />
          <SecondaryButton
            label="Back to orders"
            onPress={stranded ? exitToOrders : () => router.back()}
          />
        </View>
      </Screen>
    );
  }

  if (!order) {
    return (
      <Screen edges={["bottom"]}>
        {headerEscape}
        <View className="gg-page gap-4 pt-6">
          <Text className="text-body text-text-muted">Loading this order…</Text>
          {/*
            Shaped like the screen it becomes — the state line, the job title,
            then the specification and money cards — so the page does not
            resettle around the client the moment the order lands.
          */}
          <View className="gap-3">
            <SkeletonPill width="w-32" />
            <SkeletonLine width="w-3/4" height="h-7" />
            <SkeletonLine width="w-1/2" height="h-5" />
          </View>
          <View className="mt-4">
            <SkeletonList count={2} />
          </View>
        </View>
      </Screen>
    );
  }

  const meta = getOrderStateMeta(order.state, order.fulfillmentMode);
  const nextAction = orderNextAction(order);
  const waitingOn = orderWaitingOn(order);
  const unit = order.unit || product?.unit || "";
  const family = product?.family ?? null;
  const artworkFileId = order.artworkFileIds?.[order.artworkFileIds.length - 1] ?? null;
  const materialLabel = taxonomyLabel(taxonomy, order.material);
  const finishLabel = order.finish ? taxonomyLabel(taxonomy, order.finish) : null;
  const payable = payableInstallment(order);
  const underReview = installmentUnderReview(order);
  const showsOwnPreview = isProofApprovalState(order.state);
  /*
    Whether there is an action zone at all. The zone used to render as an empty
    Animated.View on every state that has nothing to ask for — invisible, but
    still taking a `gap-8` between the heading and whatever came next, which is
    a stripe of dead canvas on the states a client sees most.
  */
  const actionZone = isProofApprovalState(order.state)
    ? "proof"
    : isClientCorrectionState(order.state)
      ? "correction"
      : payable
        ? "pay"
        : underReview
          ? "review"
          : isIssueWindowState(order.state)
            ? "issue"
            : canRate(order)
              ? "rate"
              : null;

  return (
    /*
      Two text inputs live inside this scroll and both sit near the bottom of
      it: the payment reference on the money card, and the description on an
      issue report. Neither had any keyboard handling, so on a job far enough
      along to show them, typing happened underneath the keyboard.
    */
    <FormScreen overlay={headerEscape}>
      <View className="gg-page gap-8 pb-16 pt-4">
        <View className="gap-3">
          {/* A chip hugs its label — stretched to the column width it reads
              as a banner, and its border stops meaning "this one thing". */}
          <View className="flex-row">
            <StatusChip tone={meta.tone} label={meta.label} icon={meta.icon} />
          </View>
          <Text className="text-h1 text-text-primary">{order.title}</Text>
          <Text className="text-caption text-text-muted">Order {order.id}</Text>
          {/* Only when nothing below is already saying it. An action zone
              owns its instruction and reason, and so does the card that
              explains a payment being checked — repeating either up here is
              filler. */}
          {!nextAction && !underReview ? (
            <Text className="text-body-lg text-text-secondary">
              {waitingOn ?? "This job is in progress."}
            </Text>
          ) : null}
        </View>

        {/* One action zone at a time — the single yellow control lives here. */}
        {actionZone ? (
          <Animated.View
            key={`${order.state}:${actionZone}`}
            entering={reducedMotion ? undefined : FadeIn.duration(200)}
          >
            {actionZone === "proof" ? (
              <ProofDecision
                order={order}
                family={family}
                unit={unit}
                materialLabel={materialLabel}
                finishLabel={finishLabel}
                onUpdated={applyOrderUpdate}
              />
            ) : actionZone === "correction" ? (
              <CorrectionCard order={order} onUpdated={applyOrderUpdate} />
            ) : actionZone === "pay" && payable ? (
              <PaymentPanel order={order} installment={payable} onSubmitted={applyOrderUpdate} />
            ) : actionZone === "review" && underReview ? (
              <PaymentUnderReviewCard order={order} installment={underReview} />
            ) : actionZone === "rate" ? (
              /*
                The last thing asked, and only once. It sits in the same one
                action zone as everything else so a finished job still has
                exactly one thing to do — a rating prompt bolted on beside a
                payment panel would be the screen's second yellow control.
              */
              <View className="gg-card gap-3 p-4">
                <Text className="text-h3 text-text-primary">How did it go?</Text>
                <Text className="text-body text-text-secondary">
                  Rate this job and GRIDGO sends your next one to a shop that did well by
                  you. Three questions, and it takes a moment.
                </Text>
                <PrimaryButton
                  label="Rate this order"
                  onPress={() =>
                    router.push({ pathname: "/order/rate", params: { orderId: order.id } })
                  }
                />
              </View>
            ) : (
              <IssueWindowCard order={order} />
            )}
          </Animated.View>
        ) : null}

        {/*
          The other place the ask earns itself: a job that is waiting on
          Operations, a supplier or a rider, with nothing for the client to do
          but wonder when they will hear. "We will tell your phone" is the
          answer to the question the screen has just raised. When there *is* an
          action here the screen belongs to it, so nothing is offered.
        */}
        {!nextAction ? <PushEnableCard /> : null}

        {/*
          Two different endings, two different things to show.

          A delivery is watched: the rider is coming to them, so the map is
          theirs. A collected job is fetched: the rider only moves it between
          two of GRIDGO's own places, and what the client needs is not a route
          but an address and the word that it has arrived.
        */}
        {collectsAtOffice(order) ? (
          isAwaitingCollectionState(order.state) ? <PickupCounterCard order={order} /> : null
        ) : isTrackingState(order.state) ? (
          <DeliveryTrackingCard order={order} />
        ) : null}

        {showsFulfilmentProgress(order.state) ? (
          <FulfilmentProgress milestones={order.payoutMilestones} />
        ) : null}

        <View className="gap-4">
          <Text className="text-overline text-text-muted">SPECIFICATION</Text>
          <View className="gg-card">
            <SpecRow label="Quantity" value={describeQuantity(order.quantity, unit)} />
            <SpecRow label="Size" value={order.size || "—"} />
            {/* Resolved through the taxonomy: an order can carry a code
                rather than a name, and `hem_grommet` is not a finish a
                client recognises. */}
            <SpecRow label="Material" value={materialLabel} />
            {finishLabel ? <SpecRow label="Finish" value={finishLabel} /> : null}
            <SpecRow label="Deadline" value={formatDeadline(order.deadline)} />
            {order.promisedDate ? (
              <SpecRow label="Supplier promised" value={formatDeadline(order.promisedDate)} />
            ) : null}
            {/* A collected job is not going to the address they shopped with.
                Naming that address here is how a client ends up waiting at home
                for something sitting on our counter. */}
            {collectsAtOffice(order) ? (
              <SpecRow label="Collect at" value="GRIDGO Office" />
            ) : (
              <SpecRow label="Deliver to" value={order.address || "—"} />
            )}
            <SpecRow label="Area" value={zoneName(zones, order.zone)} />
            <SpecRow label="Artwork" value={order.artworkName || "Not uploaded"} />
          </View>

          <MoneyCard order={order} />
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
            <OrderTimeline
              timeline={order.timeline}
              currentState={order.state}
              fulfillmentMode={order.fulfillmentMode}
            />
          </View>
        </View>
      </View>
    </FormScreen>
  );
}

/**
 * What this job costs, and how much of it is settled.
 *
 * Two shapes, because there are two truths. Before a supplier accepts there is
 * no exact price, so the card shows the platform's range and says why delivery
 * is missing from it. After acceptance it shows subtotal, delivery and total —
 * the three figures the client is owed and the only three the server sends.
 */
function MoneyCard({ order }: { order: api.Order }) {
  const total = orderTotalMinor(order);
  const range = order.priceRange;

  if (total == null) {
    return (
      <View className="gg-card gap-3">
        <View className="flex-row items-baseline justify-between gap-4">
          <Text className="text-body-lg text-text-secondary">Estimated print</Text>
          <Text className="text-h3 text-text-primary">
            {range ? formatPriceRange(range.subtotalMinMinor, range.subtotalMaxMinor) : "—"}
          </Text>
        </View>
        <Text className="text-caption text-text-muted">
          An estimate of what this job costs to print. Delivery is priced by the distance
          from where it is printed, so it is added once GRIDGO has put the job on a press —
          and the exact price is set then. Nothing is owed until then.
        </Text>
      </View>
    );
  }

  const downpayment = order.payments?.downpayment;
  const balance = order.payments?.balance;

  return (
    <View className="gg-card">
      <SpecRow
        label="Print"
        value={order.subtotalMinor != null ? formatPhp(order.subtotalMinor) : "—"}
      />
      <SpecRow
        label="Delivery"
        value={order.deliveryFeeMinor != null ? formatPhp(order.deliveryFeeMinor) : "—"}
      />
      {downpayment ? (
        <SpecRow
          label={`Downpayment · ${installmentStatusLabel(downpayment.status)}`}
          value={downpayment.amountMinor != null ? formatPhp(downpayment.amountMinor) : "—"}
        />
      ) : null}
      {balance ? (
        <SpecRow
          label={`Balance · ${installmentStatusLabel(balance.status)}`}
          value={balance.amountMinor != null ? formatPhp(balance.amountMinor) : "—"}
        />
      ) : null}
      <View className="flex-row items-baseline justify-between gap-4 pt-3">
        <Text className="text-body-lg text-text-secondary">Total</Text>
        <Text className="text-h3 text-text-primary">{formatPhp(total)}</Text>
      </View>
    </View>
  );
}
