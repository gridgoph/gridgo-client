import { useLiveRefresh } from "@/hooks/useLiveRefresh";
import { ChevronLeft, ChevronRight, LifeBuoy, MessageCircle, ScrollText, Star } from "lucide-react-native";
import { useCallback, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import Animated, { FadeIn } from "react-native-reanimated";
import { Screen } from "@/components/Screen";

import { BasketGroupsCard } from "@/components/BasketGroupsCard";
import { CorrectionCard } from "@/components/CorrectionCard";
import { ErrorState } from "@/components/ErrorState";
import { DropoffConfirmationCard } from "@/components/DropoffConfirmationCard";
import { DeliveryPinCard } from "@/components/deliveryPin/DeliveryPinCard";
import { ChangeHistory } from "@/components/orderChange/ChangeHistory";
import { ChangeRequestCard } from "@/components/orderChange/ChangeRequestCard";
import { DeliveryChatRow } from "@/components/DeliveryChatRow";
import { MissedCallNotice } from "@/components/call/MissedCallNotice";
import { PickupCounterCard } from "@/components/PickupCounterCard";
import { DeliveryHandoverCard } from "@/components/DeliveryHandoverCard";
import { HubClaimCard } from "@/components/HubClaimCard";
import { FormScreen } from "@/components/FormScreen";
import { IssueWindowCard } from "@/components/IssueWindowCard";
import { JobCompleteCard } from "@/components/JobCompleteCard";
import { OrderDisclosure } from "@/components/OrderDisclosure";
import { OrderReference } from "@/components/OrderReference";
import { OrganizationDiscountRow } from "@/components/OrganizationDiscount";
import { VoucherDiscountRow } from "@/components/VoucherDiscountRow";
import { VOUCHER_LABEL, VOUCHER_SHARE_LABEL } from "@/lib/vouchers";
import { PaymentPanel, PaymentUnderReviewCard } from "@/components/PaymentPanel";
import { PrimaryButton } from "@/components/PrimaryButton";
import { ArtworkPanel } from "@/components/ArtworkPanel";
import { DesignLinkRow } from "@/components/DesignLinkRow";
import { ExactColoursRecord } from "@/components/ExactColoursRecord";
import { ApprovalRecordSummary } from "@/components/approval/ApprovalRecordSummary";
import { FoldSection } from "@/components/FoldSection";
import { LatestProgressCard } from "@/components/LatestProgressCard";
import { CoverSpineRecord } from "@/components/CoverSpineRecord";
import { NoteRow, ProductionSpecifications } from "@/components/ProductionSpecifications";
import { ProofDecision } from "@/components/ProofDecision";
import { RefundEntryRow, RefundOrderCard } from "@/components/refund/RefundOrderCard";
import { RescheduleCard } from "@/components/RescheduleCard";
import { ShopRecoveryCard } from "@/components/ShopRecoveryCard";
import { SurveyCard } from "@/components/survey/SurveyCard";
import { DeliveryTrackingScreen } from "@/components/tracking/DeliveryTrackingScreen";
import { PushEnableCard } from "@/components/PushEnableCard";
import { ReadyTime } from "@/components/ReadyTime";
import { ReviewScheduleCard } from "@/components/ReviewScheduleCard";
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
import { deliveryChatOf, deliveryChatRoute } from "@/lib/deliveryChat";
import { callWindowOpen, orderHasCalls } from "@/lib/orderCalls";
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
import { handoverKind, isHubHandover } from "@/lib/handover";
import {
  installmentLabel,
  installmentUnderReview,
  payableInstallment,
  paymentInstallment,
  paysInFull,
} from "@/lib/payment";
import { physicalInvoiceEntry, physicalInvoiceRequestsEnabled } from "@/lib/physicalInvoice";
import { cleanLabel, lineAttachments } from "@/lib/artworkAttachments";
import { orderArtwork } from "@/lib/orderArtwork";
import { orderReference } from "@/lib/orderReference";
import {
  artworkSummary,
  helpSummary,
  paymentSummary,
  RECEIVED_DETAILS_SUMMARY,
  showsReceivedView,
  specificationsSummary,
} from "@/lib/orderSections";
import { canRate } from "@/lib/rating";
import { readyEarlyLabel } from "@/lib/readyTime";
import { approvalSummaryLine } from "@/lib/approvalProof";
import { currentRefund, refundEntry } from "@/lib/refunds";
import { appliedChangeLine, deliveryPinNeedsClient } from "@/lib/deliveryPin";
import { changeItemName, changeNeedsClient, changeRequestView, paidChanges } from "@/lib/orderChanges";
import { rescheduleView } from "@/lib/reschedule";
import { shopRecoveryView } from "@/lib/shopRecovery";
import { canHaveSurvey } from "@/lib/survey";
import { useSurvey } from "@/store/survey";
import { orderPrintingMinor, serviceFeeVisibleToClient, showsServiceFee } from "@/lib/serviceFee";
import { usePlatformSettings } from "@/store/platformSettings";
import { openingHoursLines, orderReviewView, upcomingClosures } from "@/lib/operatingHours";
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
  /** The multi-shop basket this order is one group of, when it is one. */
  const [basket, setBasket] = useState<api.Basket | null>(null);
  /**
   * The handover credential (gridgo-api#124/#125): null when this order has
   * none right now, `"error"` when the read failed — a claim code is not
   * something to guess at, so a failure says so and offers a retry.
   */
  const [handover, setHandover] = useState<api.OrderHandover | null | "error">(null);
  const [error, setError] = useState<string | null>(null);
  /*
    Which order's View details and Get help are open on the received view.
    Kept by id, so switching to another shop's group of the same order opens
    folded, and never remembered: the view exists to open on three things.
  */
  const [detailsFor, setDetailsFor] = useState<string | null>(null);
  const [helpFor, setHelpFor] = useState<string | null>(null);

  const loadSequence = useRef(0);
  const loadSettings = usePlatformSettings((state) => state.load);
  const platformSettings = usePlatformSettings((state) => state.settings);
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
      // A failed basket read costs the other groups' states, never the order.
      const group = current.basketId
        ? await api.getBasket(current.basketId).catch(() => null)
        : null;
      if (sequence !== loadSequence.current) return;
      // Read with the order, so the claim code lands with the screen rather
      // than popping in under it. Only asked for when it can exist.
      const credential = handoverKind(current)
        ? await api.getOrderHandover(current.id).catch(() => "error" as const)
        : null;
      if (sequence !== loadSequence.current) return;
      // The post-order survey lives in its own store, read alongside the
      // order so a completed hand-over, a skip or a send shows on return.
      if (canHaveSurvey(current.state)) void useSurvey.getState().load(current.id);
      setHandover(credential);
      setBasket(group);
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
  // The delivery map's window opened or closed: only the order itself moved.
  const reloadOrder = useCallback(() => {
    if (!id) return;
    void api.getOrder(id).then(applyOrderUpdate).catch(() => undefined);
  }, [id, applyOrderUpdate]);

  useFocusEffect(
    useCallback(() => {
      void load();
      void loadSettings({ refresh: true }).catch(() => undefined);
      return () => { loadSequence.current++; };
    }, [load, loadSettings]),
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
  // Out of hours, or held by a closure: the card under the docket says when
  // GRIDGO reviews the artwork, so the docket does not say it twice.
  const reviewWait = orderReviewView(order);
  const unit = order.unit || product?.unit || "";
  const family = product?.family ?? null;
  const materialLabel = taxonomyLabel(taxonomy, order.material);
  const finishLabel = order.finish ? taxonomyLabel(taxonomy, order.finish) : null;
  /*
    A cancelled shop group of a multi-shop order is out of the basket's one
    payment: the other groups carry it, so this group asks nothing about it
    and its share is settled on its own.
  */
  const groupStopped = Boolean(order.basketId) && order.state === "cancelled";
  const payable = groupStopped ? null : payableInstallment(order);
  const underReview = groupStopped ? null : installmentUnderReview(order);
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
  /*
    A shop that could not take the job, or asked for more time, stops it on
    the client's decision (gridgo-supplier#101/#102). That decision is the
    action zone until it is made; once a refund is chosen, the refund is.
  */
  const recovery = shopRecoveryView(order);
  const reschedule = recovery ? null : rescheduleView(order);
  // The shop asked to change the job while printing it (report F9FCD485).
  const changeView = changeRequestView(order);
  const actionZone = order.refundHold && existingRefund
    ? "refund"
    : order.refundHold
      ? null
      : recovery
        ? "recovery"
        : reschedule
          ? "reschedule"
          : isProofApprovalState(order.state)
    ? "proof"
    : isClientCorrectionState(order.state)
      ? "correction"
      : payable
        ? "pay"
        : changeView
          ? "change"
        : deliveryPinNeedsClient(order)
          ? "pin"
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
    lineAttachments(item).flatMap((entry) =>
      entry.kind === "link"
        ? [{ link: { formatCode: entry.formatCode, url: entry.url }, label: cleanLabel(entry.label), itemName: item.itemName }]
        : [],
    ),
  );
  const artworkFiles = orderArtwork(order);
  const designLinkRows = designLinks.map(({ link, label, itemName }) => (
    <DesignLinkRow key={`${itemName}:${link.formatCode}:${link.url}`} link={link} name={label} />
  ));
  const openChat = () => router.push("/chat");
  // While the rider has the job the tracking card carries the way in; once it
  // is delivered the conversation is read-only for a day and sits down here.
  const chatSummary = deliveryChatOf(order);
  const deliveredChat = chatSummary?.status === "read_only" ? chatSummary : null;
  const openRiderChat = () => router.push(deliveryChatRoute(order.id));
  /** These zones say their own wait, and offer their own refund. */
  const shopDecision = actionZone === "refund" || actionZone === "recovery" || actionZone === "reschedule";
  /*
    While a rider is bringing it to them, the map is the screen and the order
    rides in the panel under it (gridgo-client#232). A collected job is not
    watched — the rider only moves it between two of GRIDGO's own places.
  */
  const delivering = !collectsAtOffice(order) && isTrackingState(order.state);

  /*
    The order is with the client (report 5A28D524): the screen opens on the
    check window and its countdown — or, once that has closed, the job
    complete — then the rating, then one way to get help. Everything else is
    the record, one tap away under View details. Every action the full screen
    carries is still here; only where it sits changes.
  */
  const received = showsReceivedView(order, actionZone);
  const approvalSummary = approvalSummaryLine(order);
  const detailsOpen = detailsFor === order.id;
  const helpOpen = helpFor === order.id;

  const heading = (
    <View className="gap-2">
      <Text className="text-h1 text-text-primary">{order.title}</Text>
      <OrderReference id={order.id} />
    </View>
  );

  /*
    One of several shops in a multi-shop order: every card below is this
    group's own — its progress, rider, action and money — and this is the way
    to the others (gridgo-api#117).
  */
  const basketGroups = order.basketId ? (
    <BasketGroupsCard
      order={order}
      basket={basket}
      onSelect={(groupOrderId) => router.setParams({ id: groupOrderId })}
    />
  ) : null;

  /*
    The latest thing that happened leads, and opens onto the whole story with
    the shop's photos (gridgo-client#129). The one-line wait is said here only
    when nothing below is already saying it: an action zone owns its
    instruction, and so does the card explaining a payment being checked. A
    closed job tells its own story in the card under this.
  */
  const latestProgress = (
    <LatestProgressCard
      order={order}
      note={
        !nextAction && !underReview && !finished && !shopDecision && !groupStopped && !reviewWait && !changeView
          ? (waitingOn ?? "This job is in progress.")
          : null
      }
    />
  );

  /* A settled, refused or withdrawn refund stays on the job's record. */
  const refundRecord =
    existingRefund && actionZone !== "refund" ? (
      <RefundOrderCard refund={existingRefund} onOpen={openRefund} />
    ) : null;

  /* One action zone at a time — the single yellow control lives here. */
  // The pin card draws itself (below the progress docket); here it only takes the yellow.
  const actionZoneView = actionZone && actionZone !== "pin" ? (
    <Animated.View
      key={`${order.state}:${actionZone}:${recovery?.kind ?? reschedule?.kind ?? changeView?.kind ?? ""}`}
      entering={reducedMotion ? undefined : FadeIn.duration(200)}
    >
      {actionZone === "refund" && existingRefund ? (
        <RefundOrderCard refund={existingRefund} onOpen={openRefund} />
      ) : actionZone === "recovery" && recovery ? (
        <ShopRecoveryCard order={order} view={recovery} onChanged={() => void load()} />
      ) : actionZone === "reschedule" && reschedule ? (
        <RescheduleCard order={order} view={reschedule} onChanged={() => void load()} />
      ) : actionZone === "change" && changeView ? (
        <ChangeRequestCard
          order={order}
          view={changeView}
          primary={changeNeedsClient(order)}
          onChanged={() => void load()}
        />
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
        <CorrectionCard
          order={order}
          onUpdated={applyOrderUpdate}
          onOpen={(href) => router.push(href)}
        />
      ) : actionZone === "pay" && payable ? (
        <PaymentPanel
          order={order}
          installment={payable}
          basket={basket}
          onSubmitted={applyOrderUpdate}
        />
      ) : actionZone === "review" && underReview ? (
        <PaymentUnderReviewCard order={order} installment={underReview} basket={basket} />
      ) : actionZone === "rate" ? (
        /*
          The last thing asked, and only once. It sits in the same one action
          zone as everything else so a finished job still has exactly one
          thing to do — a rating prompt bolted on beside a payment panel would
          be the screen's second yellow control.
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
        <IssueWindowCard
          order={order}
          onUpdated={applyOrderUpdate}
          onWindowElapsed={() => void load()}
        />
      )}
    </Animated.View>
  ) : null;

  /*
    The post-order survey, under whatever the job still asks. It only takes
    the yellow when nothing above it has.
  */
  const survey = canHaveSurvey(order.state) ? (
    <SurveyCard orderId={order.id} primary={!actionZone} />
  ) : null;

  /* A call the client missed, with the way to call back, ahead of the map it is about. */
  const missedCalls = orderHasCalls(order) ? <MissedCallNotice order={order} /> : null;

  /*
    The record, folded. One board rather than three cards: the docket above
    is the one object on this screen, and these are its appendix. Each
    heading keeps the fact it holds on show while folded.
  */
  const record = (
    <View className="gg-card-flush">
      <FoldSection
        section="specifications"
        title="Specifications"
        summary={specificationsSummary(order, unit)}
      >
        {order.productionItems?.length ? (
          <>
            <ProductionSpecifications order={order} taxonomy={taxonomy} bare showLinks={false} />
            <CoverSpineRecord items={order.productionItems} bare />
            <ExactColoursRecord items={order.productionItems} bare />
          </>
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
        {/* A note from before notes were per item rides on the order itself. */}
        {order.specialInstructions?.trim() ? (
          <NoteRow
            label="Special instructions"
            text={order.specialInstructions}
            readAt={order.specialInstructionsAcknowledgement?.at ?? null}
          />
        ) : null}
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
          <ReadyTime promiseBy={order.promiseBy} early={readyEarlyLabel(order)} />
        </View>
        <ChangeHistory order={order} />
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

      {/* What the client approved, kept as evidence (gridgo-client#248). */}
      {order.approvalProof && approvalSummary ? (
        <FoldSection section="approval" title="Approval record" summary={approvalSummary} divided>
          <ApprovalRecordSummary
            orderId={order.id}
            proof={order.approvalProof}
            onOpen={() => router.push({ pathname: "/order/approval", params: { orderId: order.id } })}
          />
        </FoldSection>
      ) : null}
    </View>
  );

  /*
    Help: a refund comes with a deadline that is said up front, and a client
    stuck on anything else needs the way to Operations without hunting for it.
  */
  const refundOffered = refund?.kind === "eligible" && !shopDecision;
  const helpRows = (
    <View className="gap-3">
      {refundOffered ? (
        <RefundEntryRow
          entry={refund}
          onRequest={() =>
            router.push({ pathname: "/order/refund-request", params: { orderId: order.id } })
          }
        />
      ) : null}
      {deliveredChat ? (
        <DeliveryChatRow
          chat={deliveredChat}
          onPress={openRiderChat}
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
  );

  const content = received ? (
    <View className="gg-page gap-6 pb-16 pt-4">
      {heading}

      {/* The check window and its countdown, or the job complete once it has closed. */}
      {finished ? <JobCompleteCard order={order} compact /> : null}
      {actionZone === "issue" ? actionZoneView : null}

      {/* The rating: the shop's, once the window has closed, then GRIDGO's survey. */}
      {actionZone === "rate" ? actionZoneView : null}
      {finished && order.rated ? <RatedNote /> : null}
      {survey}

      <View className="gap-3">
        <OrderDisclosure
          title="Get help?"
          summary={helpSummary({
            refundUntil: refundOffered ? (refund.deadlineAt ?? null) : null,
            refund: refundOffered,
            riderChat: Boolean(deliveredChat),
          })}
          icon={LifeBuoy}
          open={helpOpen}
          onToggle={() => setHelpFor(helpOpen ? null : order.id)}
        />
        {helpOpen ? helpRows : null}
      </View>

      <View className="gap-6">
        <OrderDisclosure
          title="View details"
          summary={RECEIVED_DETAILS_SUMMARY}
          icon={ScrollText}
          open={detailsOpen}
          onToggle={() => setDetailsFor(detailsOpen ? null : order.id)}
        />
        {detailsOpen ? (
          <>
            {basketGroups}
            {latestProgress}
            {refundRecord}
            {missedCalls}
            {record}
          </>
        ) : null}
      </View>
    </View>
  ) : (
      <View className={delivering ? "gap-6" : "gg-page gap-6 pb-16 pt-4"}>
        {/* At the door, the code the rider also sees is the thing to find first. */}
        {delivering && handover && handover !== "error" ? (
          <DeliveryHandoverCard orderId={order.id} handover={handover} />
        ) : null}

        {heading}

        {basketGroups}

        {latestProgress}

        {reviewWait && !order.refundHold && !shopDecision ? (
          <ReviewScheduleCard
            view={reviewWait}
            variant="order"
            hours={openingHoursLines(platformSettings)}
            closures={reviewWait.delayed ? upcomingClosures(platformSettings?.operatingHours) : []}
          />
        ) : null}

        <DropoffConfirmationCard key={order.id} order={order} onUpdated={applyOrderUpdate} onRefresh={() => void load()} />

        {/* Where the rider goes, asked once production finishes (report 6C8DE953). */}
        <DeliveryPinCard
          key={`pin:${order.id}`}
          order={order}
          primary={actionZone === "pin"}
          showMap={!delivering}
          onChangePin={() =>
            router.push({ pathname: "/order/delivery-pin", params: { orderId: order.id } })
          }
          onUpdated={(deliveryPin) => {
            applyOrderUpdate({ ...order, deliveryPin });
            // An applied change also moves the address and the delivery money.
            void load();
          }}
          onRefresh={() => void load()}
        />

        {finished ? <JobCompleteCard order={order} /> : null}

        {refundRecord}

        {actionZoneView}

        {survey}

        {/*
          Two different endings, two different things to show.

          A delivery is watched: the rider is coming to them, so the map is
          theirs, and it stays open — it is the latest progress, live. A
          collected job is fetched: the rider only moves it between two of
          GRIDGO's own places, and what the client needs is not a route but an
          address and the word that it has arrived.
        */}
        {/*
          With the handover switch on, both endings carry a credential: the
          hub's QR and code, or the code the rider also sees. An order made
          ready before the switch has none and keeps the old counter card.
        */}
        {missedCalls}
        {handover === "error" && handoverKind(order) ? (
          <View className="gg-card gap-3">
            <Text className="text-body-lg font-medium text-text-primary">
              {handoverKind(order) === "hub" ? "Your claim code did not load" : "Your handover code did not load"}
            </Text>
            <Text className="text-body text-text-secondary">
              {handoverKind(order) === "hub"
                ? "You need it to collect this order. Check your connection and try again."
                : "You need it to check the rider's code before you accept the order. Check your connection and try again."}
            </Text>
            <SecondaryButton label="Try again" onPress={() => void load()} />
          </View>
        ) : null}
        {collectsAtOffice(order) ? (
          isAwaitingCollectionState(order.state) ? (
            handover !== "error" && isHubHandover(handover) ? (
              <HubClaimCard order={order} handover={handover} onChanged={() => void load()} />
            ) : handover === "error" ? null : (
              <PickupCounterCard order={order} />
            )
          ) : null
        ) : null}

        {/*
          The other place the ask earns itself: a job that is waiting on
          Operations, a supplier or a rider, with nothing for the client to do
          but wonder when they will hear. When there *is* an action here the
          screen belongs to it, so nothing is offered.
        */}
        {!nextAction && !finished ? <PushEnableCard /> : null}

        {record}

        {/*
          Help sits last and stays unfolded: a refund comes with a deadline
          that is said up front, and a client stuck on anything else needs the
          way to Operations without hunting for it.
        */}
        {helpRows}
      </View>
  );

  if (delivering) {
    return (
      <DeliveryTrackingScreen
        order={order}
        overlay={headerEscape}
        nextAction={nextAction?.title ?? null}
        onOpenChat={openRiderChat}
        showCall={callWindowOpen(order)}
        onOrderChanged={reloadOrder}
      >
        {content}
      </DeliveryTrackingScreen>
    );
  }

  return (
    /*
      Two text inputs live inside this scroll: the payment reference in the
      action zone, and the description on an issue report. FormScreen keeps the
      caret above the keyboard for both.
    */
    <FormScreen overlay={headerEscape}>{content}</FormScreen>
  );
}

/**
 * A rated job's rating slot: said once, quietly, so the received view still
 * answers "did I rate this?" without a control that has nothing left to do.
 */
function RatedNote() {
  const colors = useThemeColors();
  return (
    <View className="gg-card flex-row items-center gap-3" accessible accessibilityRole="text">
      <Star size={20} color={colors.textSecondary} strokeWidth={2} aria-hidden />
      <View className="flex-1 gap-0.5">
        <Text className="text-body font-medium text-text-primary">You rated this order</Text>
        <Text className="text-caption text-text-muted">
          Thank you. GRIDGO uses it to choose the shop for your next job.
        </Text>
      </View>
    </View>
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
  const physicalInvoice = physicalInvoiceEntry(order, physicalInvoiceRequestsEnabled(settings));
  // The saved total less the saved fulfilment charge: both GRIDGO's figures.
  const printing = orderPrintingMinor(order);
  // A pick-up order chosen before matching carries the hub's fee in the
  // delivery slot. Zero (today's setting) still reads as nothing to pay.
  // The one pin change moves delivery after checkout; the checkout figures stay as they were.
  const pinChange =
    order.deliveryPin?.change?.status === "applied" && order.deliveryPin.change.feeDifferenceMinor !== 0
      ? order.deliveryPin.change
      : null;
  const checkoutTotal = order.totalMinor ?? total;
  // Approved changes the client paid for by QR, on top of checkout (report F9FCD485).
  const changes = paidChanges(order);
  const pickupFee =
    order.fulfillmentMode === "pickup" && (order.deliveryFeeMinor ?? 0) > 0
      ? (order.deliveryFeeMinor as number)
      : null;

  return (
    <View className="gap-3">
      <View>
        <SpecRow label="Printing" value={printing != null ? formatPhp(printing) : "—"} />
        <OrganizationDiscountRow source={order} />
        {/* On one part of a multi-shop order this is that part's share of the one voucher. */}
        <VoucherDiscountRow source={order} label={order.basketId ? VOUCHER_SHARE_LABEL : VOUCHER_LABEL} />
        <SpecRow
          label={pickupFee ? "Pick-up fee" : "Delivery"}
          value={
            pickupFee
              ? formatPhp(pickupFee)
              : order.fulfillmentMode === "pickup"
                ? "None — you collect"
                : order.deliveryFeeMinor != null
                  ? formatPhp(order.deliveryFeeMinor)
                  : "—"
          }
        />
        {pinChange ? (
          <SpecRow
            label={pinChange.feeDifferenceMinor > 0 ? "New pin · paid by QR" : "New pin · delivery-fee credit"}
            value={`${pinChange.feeDifferenceMinor > 0 ? "+" : "−"}${formatPhp(Math.abs(pinChange.feeDifferenceMinor))}`}
          />
        ) : null}
        {changes.map((change) => (
          <SpecRow
            key={change.id}
            label={`Change${changeItemName(order, change.lineItemId) ? ` to ${changeItemName(order, change.lineItemId)}` : ""} · paid by QR`}
            value={`+${formatPhp(change.totalMinor)}`}
          />
        ))}
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
        {pinChange ? (
          <Text className="text-caption text-text-muted">
            {appliedChangeLine(pinChange)}. The checkout total was {formatPhp(checkoutTotal)}; the receipt keeps the checkout figures.
          </Text>
        ) : changes.length ? (
          <Text className="text-caption text-text-muted">
            The checkout total was {formatPhp(checkoutTotal)}; the receipt keeps the checkout figures.
          </Text>
        ) : null}
      </View>
      <SecondaryButton label="View receipt" onPress={onOpenReceipt} />
      {physicalInvoice ? (
        <SecondaryButton label={physicalInvoice.label} onPress={onOpenPhysicalInvoice} />
      ) : null}
    </View>
  );
}
