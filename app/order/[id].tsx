import { useLiveRefresh } from "@/hooks/useLiveRefresh";
import { ChevronLeft, ChevronRight, MessageCircle } from "lucide-react-native";
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
import { IssueWindowCard } from "@/components/IssueWindowCard";
import { JobCompleteCard } from "@/components/JobCompleteCard";
import { OrderReference } from "@/components/OrderReference";
import { PaymentPanel, PaymentUnderReviewCard } from "@/components/PaymentPanel";
import { PrimaryButton } from "@/components/PrimaryButton";
import { ArtworkPanel } from "@/components/ArtworkPanel";
import { DesignLinkRow } from "@/components/DesignLinkRow";
import { FoldSection } from "@/components/FoldSection";
import { LatestProgressCard } from "@/components/LatestProgressCard";
import { ProductionSpecifications } from "@/components/ProductionSpecifications";
import { ProofDecision } from "@/components/ProofDecision";
import { RefundEntryRow, RefundOrderCard } from "@/components/refund/RefundOrderCard";
import { PushEnableCard } from "@/components/PushEnableCard";
import { ReadyTime } from "@/components/ReadyTime";
import { SecondaryButton } from "@/components/SecondaryButton";
import { SkeletonLine, SkeletonList, SkeletonPill } from "@/components/Skeleton";
import { ServiceFeeRow } from "@/components/ServiceFeeRow";
import { SpecRow } from "@/components/SpecRow";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { useThemeColors } from "@/hooks/useTheme";
import * as api from "@/lib/api";
import { formatPhp } from "@/lib/api";
import { installmentStatusLabel, userFacingError } from "@/lib/copy";
import { formatDeadline } from "@/lib/deadline";
import {
  collectsAtOffice,
  formatPriceRange,
  isAwaitingCollectionState,
  isClientCorrectionState,
  isIssueWindowState,
  isProofApprovalState,
  isTrackingState,
  orderNextAction,
  orderTotalMinor,
  orderWaitingOn,
} from "@/lib/orderState";
import { isJobComplete } from "@/lib/jobComplete";
import {
  installmentLabel,
  installmentUnderReview,
  payableInstallment,
  paymentInstallment,
  paysInFull,
} from "@/lib/payment";
import { physicalInvoiceEntry } from "@/lib/physicalInvoice";
import { orderArtwork } from "@/lib/orderArtwork";
import { orderReference } from "@/lib/orderReference";
import { artworkSummary, paymentSummary, specificationsSummary } from "@/lib/orderSections";
import { canRate } from "@/lib/rating";
import { currentRefund, refundEntry } from "@/lib/refunds";
import { printingMinor, serviceFeeVisibleToClient, showsServiceFee } from "@/lib/serviceFee";
import { usePlatformSettings } from "@/store/platformSettings";
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
  /** Null until read, and after a failed read: no entry is offered blind. */
  const [refunds, setRefunds] = useState<api.Refund[] | null>(null);
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
      const [current, catalog, zoneList, taxonomyResult, refundList] = await Promise.all([
        api.getOrder(id),
        api.listCatalog(),
        api.listZones().catch(() => [] as Zone[]),
        // Labels only. A failure costs a nicer material name, never the order.
        api.getTaxonomy().catch(() => EMPTY_TAXONOMY),
        // A failed read costs the refund card, never the order.
        api.listOrderRefunds(id).catch(() => null),
      ]);
      if (sequence !== loadSequence.current) return;
      setOrder(current);
      setProduct(catalog.find((entry) => entry.id === current.productId) ?? null);
      setZones(zoneList);
      setTaxonomy(taxonomyResult);
      setRefunds(refundList);
      setError(null);
    } catch (e) {
      if (sequence !== loadSequence.current) return;
      setError(
        userFacingError(e, "Could not load this order. Go back to Orders and open it again."),
      );
    }
  }, [id]);

  useLiveRefresh(["orders", "dispatch", "claims", "payouts"], load, { refreshOnFocus: false });

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

  const nextAction = orderNextAction(order);
  const waitingOn = orderWaitingOn(order);
  const unit = order.unit || product?.unit || "";
  const family = product?.family ?? null;
  const materialLabel = taxonomyLabel(taxonomy, order.material);
  const finishLabel = order.finish ? taxonomyLabel(taxonomy, order.finish) : null;
  const payable = payableInstallment(order);
  const underReview = installmentUnderReview(order);
  const showsOwnPreview = isProofApprovalState(order.state);
  /*
    A closed job tells its own story in the card below the title: how it
    arrived, that nothing was wrong with it, that it is paid. The one-line
    wait and the "we will tell your phone" offer both belong to a job that
    is still going, so neither is drawn once it is over.
  */
  const finished = isJobComplete(order.state);
  /*
    Whether there is an action zone at all. The zone used to render as an empty
    Animated.View on every state that has nothing to ask for — invisible, but
    still taking a `gap-8` between the heading and whatever came next, which is
    a stripe of dead canvas on the states a client sees most.
  */
  const refund = refunds ? refundEntry(order, refunds) : null;
  const existingRefund = currentRefund(refunds);
  const openRefund = () =>
    router.push({ pathname: "/order/refund", params: { orderId: order.id } });
  /*
    An open refund pauses the job. Proofs, corrections, payments and the
    issue window all wait on Operations' decision, so the refund is the whole
    action zone — and the one thing on screen that says why nothing moves.
  */
  const actionZone = order.refundHold && existingRefund
    ? "refund"
    : order.refundHold
      ? null
      : isProofApprovalState(order.state)
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

  /*
    Design links travel with each item. They are artwork as much as a file is,
    so they are listed with the files rather than inside the specification.
  */
  const designLinks = (order.productionItems ?? []).flatMap((item) =>
    (item.artworkLinks ?? []).map((link) => ({ link, itemName: item.itemName })),
  );
  const artworkFiles = orderArtwork(order);
  const designLinkRows = designLinks.map(({ link, itemName }) => (
    <DesignLinkRow key={`${itemName}:${link.formatCode}:${link.url}`} link={link} />
  ));
  const openChat = () => router.push("/chat");

  return (
    /*
      Two text inputs live inside this scroll: the payment reference in the
      action zone, and the description on an issue report. FormScreen keeps the
      caret above the keyboard for both.
    */
    <FormScreen overlay={headerEscape}>
      <View className="gg-page gap-6 pb-16 pt-4">
        <View className="gap-2">
          <Text className="text-h1 text-text-primary">{order.title}</Text>
          <OrderReference id={order.id} />
        </View>

        {/*
          The latest thing that happened leads, and opens onto the whole story
          with the shop's photos (gridgo-client#129). The one-line wait is said
          here only when nothing below is already saying it: an action zone
          owns its instruction, and so does the card explaining a payment being
          checked. A closed job tells its own story in the card under this.
        */}
        <LatestProgressCard
          order={order}
          note={
            !nextAction && !underReview && !finished && actionZone !== "refund"
              ? (waitingOn ?? "This job is in progress.")
              : null
          }
        />

        {finished ? <JobCompleteCard order={order} /> : null}

        {/* A settled, refused or withdrawn refund stays on the job's record. */}
        {existingRefund && actionZone !== "refund" ? (
          <RefundOrderCard refund={existingRefund} onOpen={openRefund} />
        ) : null}

        {/* One action zone at a time — the single yellow control lives here. */}
        {actionZone ? (
          <Animated.View
            key={`${order.state}:${actionZone}`}
            entering={reducedMotion ? undefined : FadeIn.duration(200)}
          >
            {actionZone === "refund" && existingRefund ? (
              <RefundOrderCard refund={existingRefund} onOpen={openRefund} />
            ) : actionZone === "proof" ? (
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
              <IssueWindowCard order={order} onUpdated={applyOrderUpdate} />
            )}
          </Animated.View>
        ) : null}

        {/*
          Two different endings, two different things to show.

          A delivery is watched: the rider is coming to them, so the map is
          theirs, and it stays open — it is the latest progress, live. A
          collected job is fetched: the rider only moves it between two of
          GRIDGO's own places, and what the client needs is not a route but an
          address and the word that it has arrived.
        */}
        {collectsAtOffice(order) ? (
          isAwaitingCollectionState(order.state) ? <PickupCounterCard order={order} /> : null
        ) : isTrackingState(order.state) ? (
          <DeliveryTrackingCard order={order} />
        ) : null}

        {/*
          The other place the ask earns itself: a job that is waiting on
          Operations, a supplier or a rider, with nothing for the client to do
          but wonder when they will hear. When there *is* an action here the
          screen belongs to it, so nothing is offered.
        */}
        {!nextAction && !finished ? <PushEnableCard /> : null}

        {/*
          The record, folded. One board rather than three cards: the docket
          above is the one object on this screen, and these are its appendix.
          Each heading keeps the fact it holds on show while folded.
        */}
        <View className="gg-card-flush">
          <FoldSection
            section="specifications"
            title="Specifications"
            summary={specificationsSummary(order, unit)}
          >
            {order.productionItems?.length ? (
              <ProductionSpecifications order={order} taxonomy={taxonomy} bare showLinks={false} />
            ) : (
              <>
                <SpecRow label="Quantity" value={describeQuantity(order.quantity, unit)} />
                <SpecRow label="Size" value={order.size || "—"} />
                {/* Resolved through the taxonomy: an order can carry a code
                    rather than a name, and `hem_grommet` is not a finish a
                    client recognises. */}
                <SpecRow label="Material" value={materialLabel} />
                {finishLabel ? <SpecRow label="Finish" value={finishLabel} /> : null}
              </>
            )}
            <SpecRow label="Deadline" value={formatDeadline(order.deadline)} />
            {/* A collected job is not going to the address they shopped with.
                Naming that address here is how a client ends up waiting at home
                for something sitting on our counter. */}
            {collectsAtOffice(order) ? (
              <SpecRow label="Collect at" value="GRIDGO Office" />
            ) : (
              <SpecRow label="Deliver to" value={order.address || "—"} />
            )}
            <SpecRow label="Area" value={zoneName(zones, order.zone)} />
            <View className="pt-3">
              <ReadyTime promiseBy={order.promiseBy} />
            </View>
          </FoldSection>

          <FoldSection
            section="artwork"
            title="Artwork and references"
            summary={artworkSummary({
              files: artworkFiles.length,
              links: designLinks.length,
              inProof: showsOwnPreview,
            })}
            divided
          >
            {/* The proof card above already draws the artwork it asks about;
                loading every file twice would only slow that decision. */}
            {showsOwnPreview ? (
              <Text className="py-3 text-body text-text-secondary">
                Your artwork is shown in the proof above.
              </Text>
            ) : null}
            {/* Links sit with the files, above the retention line and the
                delete action that close the section. */}
            {!showsOwnPreview && (artworkFiles.length || !designLinks.length) ? (
              <ArtworkPanel order={order} refunds={refunds}>{designLinkRows}</ArtworkPanel>
            ) : designLinkRows}
          </FoldSection>

          <FoldSection
            section="payment"
            title="Payment details"
            summary={paymentSummary(order)}
            divided
          >
            <MoneyDetails
              order={order}
              onOpenReceipt={() =>
                router.push({ pathname: "/order/receipt", params: { orderId: order.id } })
              }
              onOpenPhysicalInvoice={() =>
                router.push({ pathname: "/order/physical-invoice", params: { orderId: order.id } })
              }
            />
          </FoldSection>
        </View>

        {/*
          Help sits last and stays unfolded: a refund comes with a deadline
          that is said up front, and a client stuck on anything else needs the
          way to Operations without hunting for it.
        */}
        <View className="gap-3">
          {refund?.kind === "eligible" ? (
            <RefundEntryRow
              entry={refund}
              onRequest={() =>
                router.push({ pathname: "/order/refund-request", params: { orderId: order.id } })
              }
            />
          ) : null}
          <Pressable
            onPress={openChat}
            accessibilityRole="button"
            accessibilityLabel="Message GRIDGO about this order"
            className="gg-touch flex-row items-center gap-3 py-2"
            style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
          >
            <MessageCircle size={20} color={colors.textSecondary} strokeWidth={2} aria-hidden />
            <View className="flex-1">
              <Text className="text-body font-medium text-text-primary">Message GRIDGO</Text>
              <Text className="text-caption text-text-muted">
                Operations answers questions about this order. Mention {orderReference(order.id)}.
              </Text>
            </View>
            <ChevronRight size={18} color={colors.textMuted} strokeWidth={2} aria-hidden />
          </Pressable>
        </View>
      </View>
    </FormScreen>
  );
}

/**
 * What this job costs, and how much of it is settled — the Payment details
 * section's body.
 *
 * Two shapes, because there are two truths. Before a supplier accepts there is
 * no exact price, so it shows the platform's range and says why delivery is
 * missing from it. After acceptance it shows the receipt's own figures:
 * Printing with GRIDGO's charge already inside it, then delivery, then total.
 * The service-fee row names the rate and shows no peso amount, because the
 * amount is not a second charge — see `lib/serviceFee.ts`.
 */
function MoneyDetails({
  order,
  onOpenReceipt,
  onOpenPhysicalInvoice,
}: {
  order: api.Order;
  onOpenReceipt: () => void;
  onOpenPhysicalInvoice: () => void;
}) {
  const total = orderTotalMinor(order);
  const range = order.priceRange;
  // Above the early return: a hook after it is skipped while the total is
  // unknown and then called once it lands, which React refuses.
  const settings = usePlatformSettings((state) => state.settings);

  if (total == null) {
    return (
      <View className="gap-3 pt-1">
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

  const downpayment = paymentInstallment(order, "downpayment");
  // A paid-in-full order has no balance step: its `not_required` row is not
  // something the client owes, so it is not drawn at all.
  const balance = paysInFull(order) ? undefined : paymentInstallment(order, "balance");
  const showFee = showsServiceFee(order) && serviceFeeVisibleToClient(settings);
  const physicalInvoice = physicalInvoiceEntry(order);

  return (
    <View className="gap-3">
      <View>
        <SpecRow
          label="Printing"
          value={
            order.subtotalMinor != null
              ? formatPhp(printingMinor(order.subtotalMinor, order.serviceFeeMinor))
              : "—"
          }
        />
        <SpecRow
          label="Delivery"
          value={
            order.fulfillmentMode === "pickup"
              ? "None — you collect"
              : order.deliveryFeeMinor != null
                ? formatPhp(order.deliveryFeeMinor)
                : "—"
          }
        />
        {showFee ? (
          <ServiceFeeRow explainOnly rateBps={order.serviceFeeRateBps ?? null} />
        ) : null}
        {downpayment ? (
          <SpecRow
            label={`${installmentLabel("downpayment", order)} · ${installmentStatusLabel(downpayment.status)}`}
            value={downpayment.amountMinor != null ? formatPhp(downpayment.amountMinor) : "—"}
          />
        ) : null}
        {balance ? (
          <SpecRow
            label={
              order.unpaidBalanceCancelled && balance.status !== "confirmed"
                ? "Balance · Not owed after refund"
                : `Balance · ${installmentStatusLabel(balance.status)}`
            }
            value={balance.amountMinor != null ? formatPhp(balance.amountMinor) : "—"}
          />
        ) : null}
        <View className="flex-row items-baseline justify-between gap-4 pt-3">
          <Text className="text-body-lg text-text-secondary">Total</Text>
          <Text className="text-h3 text-text-primary">{formatPhp(total)}</Text>
        </View>
      </View>
      <SecondaryButton label="View receipt" onPress={onOpenReceipt} />
      {physicalInvoice ? (
        <SecondaryButton label={physicalInvoice.label} onPress={onOpenPhysicalInvoice} />
      ) : null}
    </View>
  );
}
