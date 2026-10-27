import { documentPagesSummary } from "@/lib/documentPages";
import {
  colourAwaitsPriceCheck,
  colourBlocksCheckout,
  colourRefusalOf,
  colourSummary,
  linePageCount,
  linePricedByColour,
  oneColourWarning,
  quantityUnit,
  sheetsLine,
} from "@/lib/colourPricing";
import { useLiveRefresh } from "@/hooks/useLiveRefresh";
import { usePhotoLinkRefresh } from "@/hooks/usePhotoLinkRefresh";
import { ChevronRight, Home, Info, MapPin, Minus, Plus, QrCode, Truck } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Linking,
  Modal,
  Pressable,
  Text,
  View,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";

import { CheckoutApproval } from "@/components/approval/CheckoutApproval";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { DeliveryZonesHelp } from "@/components/DeliveryZonesHelp";
import { EmptyState } from "@/components/EmptyState";
import { HubPickupPanel } from "@/components/HubPickupPanel";
import { CheckoutVoucher } from "@/components/CheckoutVoucher";
import { OrganizationDiscountRow, OrganizationSavingsNote } from "@/components/OrganizationDiscount";
import { VoucherCoveredPayment } from "@/components/VoucherCoveredPayment";
import { VoucherDiscountRow } from "@/components/VoucherDiscountRow";
import { ErrorState } from "@/components/ErrorState";
import { FormScreen } from "@/components/FormScreen";
import { paymentQrFromSettings, QrPaySheet } from "@/components/QrPaySheet";
import { PaymentProofRow } from "@/components/PaymentProofRow";
import { FormField } from "@/components/form/FormField";
import { TextField } from "@/components/form/TextField";
import { SamplePhoto } from "@/components/SamplePhoto";
import { ShopGroupSection } from "@/components/ShopGroupSection";
import { ReadyTime } from "@/components/ReadyTime";
import { ShopHoursLine } from "@/components/ShopHoursLine";
import { ReviewScheduleCard } from "@/components/ReviewScheduleCard";
import { ServiceFeeRow } from "@/components/ServiceFeeRow";
import { SpecRow } from "@/components/SpecRow";
import { StepTrail } from "@/components/StepTrail";
import { SwipeToRemove } from "@/components/SwipeToRemove";
import { TourTarget } from "@/components/TourTarget";
import { useThemeColors } from "@/hooks/useTheme";
import { useTourScreen } from "@/hooks/useTourScreen";
import { usePaymentProof } from "@/hooks/usePaymentProof";
import * as api from "@/lib/api";
import { formatPhp, type CartLineRecord } from "@/lib/api";
import {
  basketTotals,
  clientLineAmountMinor,
  lineName,
  lineOptionLabels,
  linesMissingArtwork,
  linesMissingDropoff,
  linesUnpriced,
  printRuns,
  type PrintRun,
} from "@/lib/basket";
import {
  addMoreFromLabel,
  groupDeliveryNote,
  groupMoneyLabel,
  groupsHeading,
  isMultiShop,
  MULTI_SHOP_PAYMENT_TITLE,
  multiShopPaymentNote,
  shopGroups,
  SINGLE_GROUP_LABEL,
  type ShopGroupView,
} from "@/lib/basketGroups";
import { noteCheckoutVisit } from "@/lib/checkoutExit";
import { unpricedLineReason } from "@/lib/clientPrice";
import { lineArtworkLinks, lineArtworkSummary, lineHasArtwork } from "@/lib/designLink";
import { holdPlacedReceipt, openReceiptAfterCheckout, receiptFromCheckout, withBasket } from "@/lib/receipt";
import { PLACE_HUSH_MS } from "@/lib/receiptPrint";
import { serviceFeeVisibleToClient } from "@/lib/serviceFee";
import { clearOrderFlow } from "@/lib/orderFlow";
import {
  artworkRefusalOf,
  blockerLine,
  lineArtworkStatus,
  type LineArtworkStatus,
  fulfilmentModeFor,
  invoiceNote,
  PAYMENT_CHOICE_BLURB,
  PAYMENT_CHOICE_LABEL,
  placeOrderBlockers,
  SWIPE_TO_DELETE_HINT,
  travelBlurb,
  travelCaveat,
  travelChoiceOf,
  travelLabel,
  TRAVEL_CHOICES,
  type TravelChoice,
} from "@/lib/checkout";
import { lineLayoutSummary, lineNeedsLayout, printLayoutRefusalOf } from "@/lib/printLayout";
import { coverSpineLineSummary, coverSpineRefusalOf, lineMissingCoverSpine } from "@/lib/coverSpine";
import { useCoverSpine } from "@/store/coverSpine";
import { userFacingError } from "@/lib/copy";
import { SHOP_PAUSED_LINE, shopHoursView, shopPaused } from "@/lib/shopHours";
import {
  GRIDGO_OFFICE,
  GRIDGO_OFFICE_BLURB,
  GRIDGO_OFFICE_LABEL,
  gridgoOfficeCoordLine,
  gridgoOfficeMapUrl,
} from "@/lib/gridgoOffice";
import { samplePhotoUri } from "@/lib/listing";
import { readyByDate, READY_TIME_EXPLANATION } from "@/lib/readyTime";
import { checkoutNoticeView, openingHoursLines, upcomingClosures } from "@/lib/operatingHours";
import { orderFlowNow } from "@/lib/orderFlow";
import { type OrderStepId } from "@/lib/orderSteps";
import { checkPaymentReference, DIGITAL_ONLY_NOTICE, FULL_PAYMENT_PERCENT, paymentPlanNote } from "@/lib/payment";
import {
  OCR_READING,
  OCR_UNREADABLE,
} from "@/lib/receiptOcr";
import { zoneLine } from "@/lib/distanceZone";
import { hubFeeLabel, hubPickupEnabled } from "@/lib/hubPickup";
import { fulfilmentSummary } from "@/lib/requestFulfilment";
import { useBasketGroupTarget } from "@/store/basketGroup";
import { ArtworkRightsBox } from "@/components/legal/ArtworkRightsBox";
import { artworkRightsPayload, cartRightsScope, useArtworkRights } from "@/store/artworkRights";
import { useCart } from "@/store/cart";
import { usePlatformSettings } from "@/store/platformSettings";
import { useCheckoutPayment } from "@/store/checkoutPayment";
import { useIsApprovedOrganization } from "@/store/organization";
import { useNotificationNudge } from "@/store/notificationNudge";
import { useVouchers } from "@/store/vouchers";
import { voucherDiscountOf, voucherErrorMessage, voucherSettlesUpFront } from "@/lib/vouchers";
import { discountLineLabel } from "@/lib/promotions";
import { artworkSignature, checkKey, useDesignLink } from "@/store/designLink";
import {
  approvalDevice,
  approvalErrorMessage,
  approvalIsStale,
  approvalRefusalCode,
  basketApprovalMethod,
} from "@/lib/approvalProof";
import { approvalStatus, cartApprovalScope, useApproval } from "@/store/approval";

/**
 * The checkout sheet.
 *
 * Everything the client has chosen, in the order they need to check it: what is
 * being printed, how it travels, where, how it is paid for, and what it comes
 * to. When the job is wanted was asked before matching; this sheet does not
 * ask again. One screen rather than a wizard, because none of these decisions
 * depends on the one before it — a client changing the address should not have
 * to walk back through their basket to do it.
 *
 * The totals here reproduce what checkout will write, from the same settings
 * and the same formulas, so the sheet and the invoice agree. Where GRIDGO
 * cannot yet know a figure — no drop-off, so no distance band — the sheet says
 * so rather than showing a number that will move.
 *
 * Placing the order sends the QR reference and its receipt for the up-front
 * share — the whole total on a paid-in-full plan, 75% on the old one. That is
 * submitted, never taken: no money moves through GRIDGO, Operations matches the
 * reference by hand, and nothing on this sheet may read as paid.
 */
/** How often the basket is read while a page's colour is still being measured. */
const COLOUR_POLL_MS = 4000;

export default function CheckoutScreen() {
  const router = useRouter();
  const colors = useThemeColors();

  const cart = useCart((state) => state.cart);
  const cartId = useCart((state) => state.cartId);
  const rightsScope = cartId ? cartRightsScope(cartId) : null;
  const rightsAgreed = useArtworkRights((state) =>
    rightsScope ? state.agreed[rightsScope] === true : false,
  );
  const loading = useCart((state) => state.loading);
  const hydrated = useCart((state) => state.hydrated);
  const busy = useCart((state) => state.busy);
  const loadCart = useCart((state) => state.load);
  const autofillDropoff = useCart((state) => state.autofillDropoff);
  const run = useCart((state) => state.run);
  const adopt = useCart((state) => state.adopt);
  const clearCart = useCart((state) => state.clear);

  const [settings, setSettings] = useState<api.PlatformSettings | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [referenceTouched, setReferenceTouched] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [placeError, setPlaceError] = useState<string | null>(null);
  const [approvalError, setApprovalError] = useState<string | null>(null);
  const [showQr, setShowQr] = useState(false);
  const [viewingProof, setViewingProof] = useState(false);
  // The line a swipe or a Remove tap has asked about. Nothing leaves the
  // basket until this is answered.
  const [removing, setRemoving] = useState<CartLineRecord | null>(null);
  const scrollRef = useRef<{ scrollTo?: (opts: { y: number; animated?: boolean }) => void }>(null);
  const contentRef = useRef<View>(null);
  const fields = useRef<Partial<Record<"artwork" | "address" | "proof" | "reference" | "rights" | "approval", View | null>>>({});
  const placedOrder = useRef(false);

  // One funnel visit per time checkout opens. Fixing artwork, the address or a
  // date pushes over this screen and comes back, and is still the same visit.
  useEffect(() => {
    void api.recordFunnel({ kind: "checkout_reached" });
    return () => {
      if (!placedOrder.current) void api.recordFunnel({ kind: "checkout_left" });
    };
  }, []);

  const proof = usePaymentProof(cartId);
  const setArtworkProblem = useDesignLink((state) => state.setProblem);
  const reference = useCheckoutPayment((state) => state.reference);
  const setReference = useCheckoutPayment((state) => state.setReference);
  const applyOcrReference = useCheckoutPayment((state) => state.applyOcrReference);
  const resetPayment = useCheckoutPayment((state) => state.reset);

  useEffect(() => {
    if (proof.ocr.status !== "filled" || !proof.ocr.reference) return;
    applyOcrReference(proof.ocr.reference);
  }, [proof.ocr, applyOcrReference]);

  const loadSequence = useRef(0);
  const load = useCallback(async () => {
    const sequence = ++loadSequence.current;
    // The wallet beside the basket: which vouchers could go on it, and
    // whether the one on it is held. GRIDGO's quote already carries its pick.
    void useVouchers.getState().load();
    await loadCart();
    if (sequence !== loadSequence.current) return;
    try {
      const settings = await api.getSettings();
      if (sequence !== loadSequence.current) return;
      setSettings(settings);
      // The same charges price every other screen; keep them in step.
      usePlatformSettings.getState().adopt(settings);
      setLoadError(null);
    } catch (e) {
      if (sequence !== loadSequence.current) return;
      setSettings(null);
      setLoadError(
        userFacingError(
          e,
          "GRIDGO could not read its current charges. Your order is safe — try again in a moment.",
        ),
      );
    }
  }, [loadCart]);

  useLiveRefresh(["orders", "catalog", "settings", "carts"], load, { refreshOnFocus: false });

  useFocusEffect(
    useCallback(() => {
      void load();
      return () => { loadSequence.current++; };
    }, [load]),
  );

  // Tells GRIDGO checkout was reached, so a client who leaves without paying
  // can be asked why on a later app open (`lib/checkoutExit.ts`). Fire and
  // forget: it never waits, and a refusal never reaches the screen.
  useFocusEffect(
    useCallback(() => {
      if (cartId) noteCheckoutVisit(cartId);
    }, [cartId]),
  );

  // Each line's sample is a signed link that expires five minutes after the
  // basket was read. Coming back to the app on an old read, or a sample failing
  // on an expired link, reads the basket again — `GET /me/carts/:id` signs the
  // photos afresh — rather than latching "This photo will not load".
  const heldListings = useMemo(() => (cart ? cart.lines.map((line) => line.listing) : null), [cart]);
  const rereadPhotos = useCallback(async () => {
    await loadCart();
    return useCart.getState().cart?.lines.map((line) => line.listing) ?? null;
  }, [loadCart]);
  const onStalePhoto = usePhotoLinkRefresh(heldListings, rereadPhotos);

  const lines = useMemo(() => cart?.lines ?? [], [cart]);
  useTourScreen("checkout", hydrated && lines.length > 0);
  const feeRateBps = settings?.serviceFeeRateBps ?? null;
  const runs = useMemo(() => printRuns(lines, feeRateBps), [lines, feeRateBps]);
  // GRIDGO's own quote for the basket (`cart.clientQuote`): printing, each
  // run's delivery leg and zone, any pick-up fee, the total and the up-front
  // share. The sheet adds nothing up itself. A basket printed by several
  // shops (gridgo-api#117) is quoted paid in full, and is drawn by GRIDGO's
  // own shop groups, each with its own delivery fee.
  const totals = useMemo(() => basketTotals({ cart, settings }), [cart, settings]);
  const multi = isMultiShop(cart);
  const groups = useMemo(() => shopGroups(cart), [cart]);

  const travel = travelChoiceOf(cart);
  // Chosen before the match (#158): read back here, never asked again.
  const locked = cart?.requestFulfillment ?? null;
  // A line priced by colour has its own reasons for no total yet (still
  // measuring, copies or sets, a page awaiting a price check), said in its
  // own words rather than "no price at this quantity".
  const colourUnready = lines.filter((line) => colourBlocksCheckout(line) && !colourAwaitsPriceCheck(line));
  const colourPriceCheck = lines.filter(colourAwaitsPriceCheck);
  const unpriced = linesUnpriced(lines).filter((line) => !colourBlocksCheckout(line));
  // While GRIDGO measures a page, read the basket until its price lands.
  const colourMeasuring = lines.some((line) => line.colourPricing?.status === "pending");
  useEffect(() => {
    if (!colourMeasuring) return;
    const timer = setInterval(() => void loadCart(), COLOUR_POLL_MS);
    return () => clearInterval(timer);
  }, [colourMeasuring, loadCart]);
  const missingArtwork = linesMissingArtwork(lines);
  // Every design link meets its check before the order can go (#122): a link
  // kept on an earlier visit is checked again here, once per session.
  const linkChecks = useDesignLink((state) => state.checks);
  const artworkProblems = useDesignLink((state) => state.problems);
  const verifyLink = useDesignLink((state) => state.verify);
  const linkKeys = lines.flatMap((line) => lineArtworkLinks(line).map(checkKey)).join("\n");
  useEffect(() => {
    for (const line of useCart.getState().cart?.lines ?? []) {
      for (const link of lineArtworkLinks(line)) void verifyLink(link);
    }
  }, [linkKeys, verifyLink]);
  const artworkStatus = (line: CartLineRecord) => lineArtworkStatus(line, linkChecks, artworkProblems);
  const checkingArtwork = lines.filter((line) => artworkStatus(line)?.kind === "checking");
  const artworkProblem = lines.filter((line) => artworkStatus(line)?.kind === "problem");
  const missingLayout = lines.filter(lineNeedsLayout);
  const missingCoverSpine = lines.filter(lineMissingCoverSpine);
  const referenceCheck = checkPaymentReference(reference);
  // A whole-order launch voucher that leaves nothing to pay now: GRIDGO
  // settles the first payment with it, so no QR, screenshot or reference is
  // asked for — or sent — and a receipt being read cannot hold the order up.
  const noCash = voucherSettlesUpFront(cart?.clientQuote);
  const ocrReading = !noCash && proof.ocr.status === "reading";
  const shopClosed = lines.filter((line) => shopPaused(line.listing?.shopHours));
  // How GRIDGO wants this basket approved (gridgo-client#248), and whether the
  // client has approved exactly this version of it. Any change to the basket
  // moves its version, so an approval given before it no longer counts.
  const approvalMethod = basketApprovalMethod(cart);
  const approvalScope = cartId ? cartApprovalScope(cartId) : null;
  const reviewedVersion = cart ? String(cart.version) : "";
  const approvalDraft = useApproval((state) => (approvalScope ? state.drafts[approvalScope] : undefined));
  const approvalState = approvalMethod ? approvalStatus(approvalDraft, approvalMethod, reviewedVersion) : "given";
  const blockers = placeOrderBlockers({
    lineCount: lines.length,
    linesShopClosed: shopClosed.length,
    linesUnpriced: unpriced.length,
    linesMissingArtwork: missingArtwork.length,
    linesCheckingArtwork: checkingArtwork.length,
    linesArtworkProblem: artworkProblem.length,
    linesMissingLayout: missingLayout.length,
    linesColourUnready: colourUnready.length,
    linesColourPriceCheck: colourPriceCheck.length,
    linesMissingCoverSpine: missingCoverSpine.length,
    linesMissingDropoff: linesMissingDropoff(cart).length,
    // More than one group: each is printed and delivered for its own date, so
    // GRIDGO needs one on every product (gridgo-client#189).
    missingBasketDate: multi && groups.some((group) => group.deadline == null),
    referenceOk: noCash || ocrReading || referenceCheck.ok,
    hasProof: noCash || Boolean(proof.state.fileId),
    hasSettings: Boolean(settings),
    rightsAgreed,
    approval: approvalMethod && approvalState !== "given" ? approvalMethod : "given",
  });

  /** Every basket change goes through GRIDGO and stores what comes back. */
  const change = async (work: (id: string) => Promise<api.Cart>) => {
    try {
      adopt(await run(work));
      setPlaceError(null);
    } catch (e) {
      setPlaceError(
        userFacingError(e, "GRIDGO could not change your order. Try again in a moment."),
      );
    }
  };

  /*
   * The voucher on this basket (gridgo-api#204). Every change goes through
   * GRIDGO, which answers with the re-priced basket; the wallet is read again
   * after, because applying holds a voucher and removing lets it go.
   */
  const isOrganization = useIsApprovedOrganization();
  const voucherChange = async (
    work: (id: string) => Promise<api.CartVoucherResult>,
    after?: () => void,
  ): Promise<boolean> => {
    const vouchers = useVouchers.getState();
    vouchers.setCodeNotice(null);
    try {
      const result = await run(work);
      adopt(result.cart);
      vouchers.adoptClock(result.serverTime);
      after?.();
      return true;
    } catch (e) {
      vouchers.setCodeNotice({
        ok: false,
        text: voucherErrorMessage(e, userFacingError(e, "GRIDGO could not change the voucher on your order. Try again in a moment.")),
      });
      return false;
    } finally {
      void useVouchers.getState().load();
    }
  };
  const applyVoucher = (voucherId: string) =>
    void voucherChange(
      (id) => api.applyCartVoucher(id, { voucherId }),
      () => cartId && useVouchers.getState().markRemoved(cartId, false),
    );
  const removeVoucher = () =>
    void voucherChange(
      (id) => api.removeCartVoucher(id),
      () => cartId && useVouchers.getState().markRemoved(cartId, true),
    );
  /** A code typed at checkout: into the wallet first, so its answer is precise, then onto this order. */
  const applyCode = async (code: string): Promise<boolean> => {
    const outcome = await useVouchers.getState().addCode(code);
    if (!outcome.ok || !outcome.usable) return false;
    const applied = await voucherChange(
      (id) => api.applyCartVoucher(id, { voucherId: outcome.voucher.id }),
      () => cartId && useVouchers.getState().markRemoved(cartId, false),
    );
    if (applied) {
      useVouchers.getState().setCodeNotice({ ok: true, text: `${formatPhp(outcome.voucher.valueMinor)} voucher added and applied to this order.` });
    }
    return applied;
  };

  useEffect(() => {
    if (travel !== "delivery" || !cartId || cart?.id !== cartId || cart?.defaultDropoff) return;
    let alive = true;
    void autofillDropoff(() => alive).catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [autofillDropoff, cart?.id, cart?.defaultDropoff, cartId, travel]);

  const setTravel = (choice: TravelChoice) =>
    change(async (id) => {
      const cartAfter = await api.setCartFulfilment(id, {
        fulfillmentMode: fulfilmentModeFor(choice),
      });
      // Leaving multi-drop puts every line back on the basket's one address;
      // a hidden per-line drop-off would reappear days later.
      if (choice !== "multi_drop" && cartAfter.lines.some((line) => line.dropoff)) {
        return api.setCartDropoffs(id, {
          lines: cartAfter.lines.map((line) => ({ lineId: line.id, dropoff: null })),
        });
      }
      return cartAfter;
    });

  /**
   * The step trail's destinations from here.
   *
   * Listing and Artwork are per-item, and checkout is looking at a basket
   * rather than one item — so they address the item most recently worked on,
   * which is the one the client just came from. Shop goes back to the board
   * this run started on, or to the start of choosing one when the app has been
   * restarted since.
   */
  const lastLine = lines.at(-1) ?? null;

  /**
   * "Add more from Shop A for Fri 12 Oct": the products that group's shop can
   * still make by that date, so the next one rides in the same delivery (#267).
   */
  const addToGroup = (groupId: string, label: string, deadline: string | null) => {
    useBasketGroupTarget.getState().set(groupId, label, deadline);
    router.push("/request/add-more");
  };

  /**
   * A one-shop checkout adds more the same way (report 75DCBF4A): that group's
   * own products, never the category picker. The client has only ever seen
   * "what GRIDGO is printing" here, so the group is "this shop" rather than a
   * letter. An older cart without groups still opens the picker.
   */
  const addToRun = (run: PrintRun) => {
    const group = groups.find((candidate) =>
      candidate.lines.some((line) => run.lines.some((runLine) => runLine.id === line.id)),
    );
    if (group) addToGroup(group.id, SINGLE_GROUP_LABEL, group.deadline);
    else router.push("/request/category");
  };

  /** Move one group's products to another date — or give a "no rush" group one. */
  const changeGroupDate = (group: ShopGroupView) =>
    router.push({
      pathname: "/request/when",
      params: {
        mode: "group",
        lineIds: group.lines.map((line) => line.id).join(","),
        label: group.label,
        ...(group.deadline ? { current: group.deadline } : {}),
        subcategory: group.lines[0]?.listing?.subcategoryCode ?? "",
      },
    });

  const goStep = (step: OrderStepId) => {
    if (step === "shop") {
      const flow = orderFlowNow();
      if (!flow) {
        router.push("/request/category");
        return;
      }
      router.navigate({
        pathname: "/request/match",
        params: { subcategory: flow.subcategoryCode, category: flow.categoryCode },
      });
      return;
    }
    if (!lastLine) return;
    if (step === "listing") {
      router.push({
        pathname: "/request/listing",
        params: { itemId: lastLine.catalogItemId, lineId: lastLine.id },
      });
      return;
    }
    if (step === "artwork") {
      router.push({ pathname: "/request/artwork", params: { lineId: lastLine.id } });
    }
  };

  /** Confirmed: this line leaves the basket. */
  const confirmRemove = async () => {
    const line = removing;
    setRemoving(null);
    if (!line) return;
    await change((id) => api.removeCartLine(id, line.id));
  };

  const scrollToBlocker = (blocker: (typeof blockers)[number]) => {
    const key =
      blocker === "artwork" ||
      blocker === "price" ||
      blocker === "artwork_problem" ||
      blocker === "layout" ||
      blocker === "colour" ||
      blocker === "colour_price_check" ||
      blocker === "cover_spine" ||
      blocker === "date"
        ? "artwork"
        : blocker === "address"
          ? "address"
          : blocker === "proof"
            ? "proof"
            : blocker === "reference"
              ? "reference"
              : blocker === "rights"
                ? "rights"
                : blocker === "approval" || blocker === "approval_signature"
                  ? "approval"
                  : null;
    if (!key) return;
    const content = contentRef.current;
    if (!content) return;
    fields.current[key]?.measureLayout(content, (_x, y) => {
      scrollRef.current?.scrollTo?.({ y: Math.max(0, y - 12), animated: true });
    }, () => undefined);
  };

  const commit = () => {
    if (ocrReading || placing || busy) return;
    if (travel === "pickup" && !hubPickupEnabled(settings)) {
      setPlaceError("Hub pick-up is currently unavailable for new orders. Choose delivery, or start a new print job to change a locked pick-up choice.");
      return;
    }
    if (blockers.length) {
      setAttempted(true);
      if (blockers.includes("reference")) setReferenceTouched(true);
      // The form is on the book's Artwork: that is where the client goes.
      if (blockers[0] === "cover_spine" && missingCoverSpine[0]) {
        router.push({ pathname: "/request/artwork", params: { lineId: missingCoverSpine[0].id, focus: "cover" } });
        return;
      }
      scrollToBlocker(blockers[0]);
      return;
    }
    void place();
  };

  const place = async () => {
    const proofFileId = proof.state.fileId;
    if (blockers.length || ocrReading || placing || !cartId || (!noCash && !proofFileId)) return;
    setPlacing(true);
    setPlaceError(null);
    setApprovalError(null);
    try {
      // The version the client approved. Setting the default level below is
      // GRIDGO's own default, not a change to what they approved, so the
      // approval follows the version that write answers with.
      let approvedVersion = cart?.version ?? null;
      // The cart already carries when the job is wanted. Checkout does not
      // ask again. A basket with no level at all is the platform default.
      if (!cart?.serviceLevel) {
        const after = await api.setCartFulfilment(cartId, { serviceLevel: "standard" });
        approvedVersion = after.version;
      }
      // A voucher can run out or be released between the screen and the tap,
      // and GRIDGO then writes the order at the full price. The payment the
      // client just sent was for the total on screen — or, with nothing to
      // pay, no payment at all — so read the basket again and stop if that
      // moved.
      if (voucherDiscountOf(cart?.clientQuote) > 0) {
        const fresh = await api.getCart(cartId);
        if (
          fresh.clientQuote?.totalMinor !== totals.totalMinor ||
          voucherSettlesUpFront(fresh.clientQuote) !== noCash
        ) {
          adopt(fresh);
          void useVouchers.getState().load();
          setPlaceError(
            noCash
              ? "Your total changed because the voucher can no longer be used on this order. Check the new total and how to pay it before you place the order."
              : "Your total changed because the voucher can no longer be used on this order. Check the new total and pay that amount before you place the order.",
          );
          return;
        }
      }
      // One approval for the basket; GRIDGO records it against every order
      // the basket becomes. A drawn one sends its signature first.
      const approval: api.ApprovalBody | null =
        approvalMethod && approvalScope && approvedVersion != null
          ? {
              accepted: true,
              method: approvalMethod,
              ...(approvalMethod === "drawn"
                ? { signatureFileId: await useApproval.getState().signatureFileId(approvalScope) }
                : {}),
              expectedCartVersion: approvedVersion,
              device: await approvalDevice(),
            }
          : null;
      // The order's own notices land while its receipt prints: no chime over the print.
      useNotificationNudge.getState().hush(PLACE_HUSH_MS);
      const { order, invoice, basket } = await api.checkoutCart(
        cartId,
        noCash || !proofFileId ? null : { reference: reference.trim(), proofFileId },
        // Recorded by GRIDGO against every order this basket becomes.
        await artworkRightsPayload(),
        approval,
      );
      placedOrder.current = true;
      void api.recordFunnel({ kind: "paid", orderId: order.id });
      // A multi-shop basket answers with one combined receipt; its order is
      // the first shop group, which the receipt and its "View order" open.
      // The basket beside it carries each group's date for the slip.
      // The slip says what GRIDGO answered: settled by the voucher, or sent
      // by QR and waiting on Operations.
      const placed = receiptFromCheckout(invoice, order, noCash ? "" : reference);
      holdPlacedReceipt(placed && basket?.groups ? withBasket(placed, basket) : placed);
      resetPayment();
      if (approvalScope) useApproval.getState().withdraw(approvalScope);
      useBasketGroupTarget.getState().clear();
      clearCart();
      clearOrderFlow();
      openReceiptAfterCheckout(router, order.id);
    } catch (e) {
      // The approval was refused: said beside the approval, where the fix is.
      // A basket that changed since it was approved is read again and asked
      // for again, the same as GRIDGO asks.
      const approvalCode = approvalRefusalCode(e);
      if (approvalCode || (e instanceof Error && e.message === "signature_missing")) {
        const message =
          approvalErrorMessage(approvalCode) ??
          "Your signature did not reach GRIDGO. Sign again and place the order once more.";
        if (approvalIsStale(approvalCode) || !approvalCode) {
          if (approvalScope) useApproval.getState().withdraw(approvalScope);
          void loadCart();
        }
        setAttempted(true);
        setApprovalError(message);
        setPlaceError(message);
        scrollToBlocker(approvalMethod === "drawn" ? "approval_signature" : "approval");
        return;
      }
      // The artwork was turned down (#122): the reason belongs on the line
      // and on its Artwork screen, where the fix is, not only in the footer.
      const refusal = e instanceof api.ApiError ? artworkRefusalOf(e.body) : null;
      const refused = refusal?.lineId ? lines.find((line) => line.id === refusal.lineId) : null;
      // The layout is missing, or the shop stopped printing the one chosen:
      // the choice is on the item's Artwork, so that is where this goes.
      const layoutRefusal = e instanceof api.ApiError ? printLayoutRefusalOf(e.body) : null;
      const layoutLine = layoutRefusal ? lines.find((line) => line.id === layoutRefusal.lineId) : null;
      // The cover and spine (gridgo-api docs/HARDBOUND_COVER_API.md): missing
      // while GRIDGO requires it, or its cover page gone from the files, is
      // fixed on the book's Artwork. A form on a product that no longer asks
      // comes off, and the client places the order again.
      const coverRefusal = e instanceof api.ApiError ? coverSpineRefusalOf(e.body) : null;
      // A page priced by colour is not priced yet (gridgo-api
      // docs/COLOUR_PRICING_API.md): the basket is read again so the line
      // shows which page, and the reason is said here.
      const colourRefusal = e instanceof api.ApiError ? colourRefusalOf(e.body) : null;
      if (colourRefusal) {
        void loadCart();
        setAttempted(true);
        const colourLine = lines.find((line) => line.id === colourRefusal.lineId);
        setPlaceError(
          blockerLine(
            colourRefusal.code === "colour_price_check_required" ? "colour_price_check" : "colour",
            colourLine ? lineName(colourLine) : undefined,
          ),
        );
        scrollToBlocker("colour");
        return;
      }
      if (coverRefusal) {
        setAttempted(true);
        if (coverRefusal.code === "cover_spine_not_applicable") {
          const cleared = coverRefusal.lineId ? await useCoverSpine.getState().clear(coverRefusal.lineId) : false;
          setPlaceError(
            cleared
              ? "This product no longer takes cover and spine details, so they were taken off. Check your order and place it again."
              : coverRefusal.message,
          );
          return;
        }
        void loadCart();
        setPlaceError(coverRefusal.message);
        if (coverRefusal.lineId && lines.some((line) => line.id === coverRefusal.lineId)) {
          router.push({ pathname: "/request/artwork", params: { lineId: coverRefusal.lineId, focus: "cover" } });
        }
        return;
      }
      if (layoutRefusal) {
        void loadCart();
        setAttempted(true);
        setPlaceError(userFacingError(e, "Choose how your file sits on the paper first."));
        if (layoutLine) {
          router.push({ pathname: "/request/artwork", params: { lineId: layoutLine.id, focus: "layout" } });
        }
        return;
      }
      if (refusal && refused && refusal.code !== "artwork_check_required") {
        setArtworkProblem(refused.id, {
          code: refusal.code,
          message: refusal.message,
          signature: artworkSignature(refused),
        });
        setAttempted(true);
        scrollToBlocker("artwork_problem");
        setPlaceError(blockerLine("artwork_problem", lineName(refused)));
        return;
      }
      setPlaceError(
        refusal
          ? refusal.message
          : voucherErrorMessage(
              e,
              userFacingError(
                e,
                "GRIDGO could not place your order. Nothing was charged — your order is still here, so try again.",
              ),
            ),
      );
    } finally {
      setPlacing(false);
    }
  };

  // Held until the phone has said whether it is carrying a basket at all.
  // A loading empty basket must not paint the Pay sheet: that sheet is what
  // "select cart and it shows then vanishes" was — chrome for an order that
  // has not arrived, then the empty state a tick later.
  if (!hydrated || (loading && lines.length === 0)) {
    return (
      <FormScreen>
        <View className="gg-page pt-16">
          <Text className="text-body text-text-muted">Loading your order…</Text>
        </View>
      </FormScreen>
    );
  }

  if (lines.length === 0) {
    return (
      <FormScreen>
        <View className="gg-page pt-16">
          <EmptyState
            title="Nothing to print yet"
            body="Pick what you are printing and GRIDGO will find a printer for it."
            actionLabel="Start a print job"
            onAction={() => router.replace("/request/category")}
            altActionLabel="Go to Home"
            onAltAction={() => router.replace("/(tabs)/home")}
          />
        </View>
      </FormScreen>
    );
  }

  // A shop closed for now is refused whatever else is filled in, so the button
  // is off rather than a tap that only scrolls; the line under it says why.
  const placeLocked = ocrReading || placing || busy || shopClosed.length > 0;

  const lineRow = (line: CartLineRecord) => (
    <LineRow
      key={line.id}
      line={line}
      artwork={artworkStatus(line)}
      serviceFeeRateBps={settings?.serviceFeeRateBps ?? null}
      busy={busy}
      onStalePhoto={onStalePhoto}
      onEdit={() =>
        router.push({
          pathname: "/request/listing",
          params: { itemId: line.catalogItemId, lineId: line.id },
        })
      }
      onArtwork={() =>
        router.push({ pathname: "/request/artwork", params: { lineId: line.id } })
      }
      onQuantity={(quantity) =>
        // Copies only. Pages live on measurement, and sending them
        // here would replace a 30-page document with whatever the
        // stepper last showed.
        void change((id) => api.updateCartLine(id, line.id, { quantity }))
      }
      onRemove={() => setRemoving(line)}
    />
  );
  const missingShown = attempted || referenceTouched;
  // Out of hours: when GRIDGO reviews the artwork, and the estimate that
  // counts it (gridgo-api#203). Never a reason to hold the order back.
  const afterHours = checkoutNoticeView(cart?.checkoutNotice);

  return (
    <FormScreen
      scrollRef={scrollRef}
      footer={
        <TourTarget
          step="checkout"
          testID="checkout-footer"
          className="gap-3 border-t border-outline bg-surface px-4 pb-2 pt-3"
        >
          <View className="flex-row items-baseline justify-between gap-3">
            <Text className="text-body text-text-secondary">Total</Text>
            <Text className="text-h3 text-text-primary">
              {totals.totalMinor == null ? "Not yet" : formatPhp(totals.totalMinor)}
            </Text>
          </View>
          <View className="flex-row items-center gap-2">
            <Pressable
              onPress={() => router.replace("/(tabs)/home")}
              accessibilityRole="button"
              accessibilityLabel="Go to Home and keep this order"
              className="gg-btn-secondary h-12 w-12 items-center justify-center px-0"
              style={({ pressed }) => (pressed ? { opacity: 0.85 } : undefined)}
            >
              <Home
                size={20}
                color={colors.textPrimary}
                strokeWidth={2}
                aria-hidden
              />
            </Pressable>
            <Pressable
              onPress={commit}
              disabled={placeLocked}
              accessibilityRole="button"
              accessibilityLabel="Place this order"
              accessibilityState={{ disabled: placeLocked }}
              className={
                placeLocked ? "gg-btn-primary gg-disabled min-w-0 flex-1" : "gg-btn-primary min-w-0 flex-1"
              }
              style={({ pressed }) =>
                pressed && !placeLocked ? { opacity: 0.9 } : undefined
              }
            >
              <Text className="text-button text-action-yellow-on">
                {placing ? "Placing your order…" : ocrReading ? "Reading the reference…" : "Place order"}
              </Text>
            </Pressable>
          </View>

          <Text
            className={placeError || (missingShown && blockers.length) || shopClosed.length
              ? "text-center text-caption text-error"
              : "text-center text-caption text-text-muted"}
          >
            {placeError || (ocrReading
              ? OCR_READING
              : blockers.length
                ? blockers[0] === "reference" && proof.ocr.status === "unreadable"
                  ? OCR_UNREADABLE
                  : blockerLine(
                      blockers[0],
                      blockers[0] === "shop_closed"
                        ? shopClosed.length === 1
                          ? lineName(shopClosed[0])
                          : undefined
                        : blockers[0] === "price"
                        ? unpriced.length === 1
                          ? lineName(unpriced[0])
                          : undefined
                        : blockers[0] === "artwork_problem"
                          ? artworkProblem.length === 1
                            ? lineName(artworkProblem[0])
                            : undefined
                        : blockers[0] === "layout"
                          ? missingLayout.length === 1
                            ? lineName(missingLayout[0])
                            : undefined
                        : blockers[0] === "colour"
                          ? colourUnready.length === 1
                            ? lineName(colourUnready[0])
                            : undefined
                        : blockers[0] === "colour_price_check"
                          ? colourPriceCheck.length === 1
                            ? lineName(colourPriceCheck[0])
                            : undefined
                        : blockers[0] === "cover_spine"
                          ? missingCoverSpine.length === 1
                            ? lineName(missingCoverSpine[0])
                            : undefined
                        : missingArtwork.length === 1
                          ? lineName(missingArtwork[0])
                          : undefined,
                    )
                : afterHours?.reviewAt
                  ? `GRIDGO checks your file ${afterHours.reviewAt}, before the shop starts.`
                  : "GRIDGO checks your file before the shop starts.")}
          </Text>
        </TourTarget>
      }
      /* Beside the scroll, never inside it — see `FormScreen`'s `overlay`. */
      overlay={
        <>
          <QrPaySheet
            open={showQr}
            onClose={() => setShowQr(false)}
            downpaymentMinor={totals.downpaymentMinor}
            downpaymentPercent={totals.downpaymentPercent}
            imageUrl={paymentQrFromSettings(settings)?.imageUrl ?? null}
          />

          {/*
            Swiping a row does not remove it; it asks. A basket line carries an
            upload and a quantity somebody typed, and a stray thumb on a scrolling
            list is not a good enough reason to lose either.
          */}
          <ConfirmDialog
            visible={Boolean(removing)}
            question={removing ? `Remove ${lineName(removing)}?` : "Remove this item?"}
            body="It comes out of your order. The artwork stays on GRIDGO, so adding it back means picking the options again."
            confirmLabel="Remove"
            cancelLabel="Keep it"
            tone="destructive"
            busy={busy}
            onConfirm={() => void confirmRemove()}
            onCancel={() => setRemoving(null)}
          />
          <Modal
            visible={viewingProof}
            transparent
            animationType="fade"
            onRequestClose={() => setViewingProof(false)}
          >
            <Pressable
              onPress={() => setViewingProof(false)}
              accessibilityRole="button"
              accessibilityLabel="Close the payment screenshot"
              className="flex-1 items-center justify-center bg-black/90 px-4"
            >
              {proof.state.localUri ? (
                <Image
                  source={{ uri: proof.state.localUri }}
                  accessibilityLabel="Payment screenshot"
                  resizeMode="contain"
                  style={{ width: "100%", height: "80%" }}
                />
              ) : null}
              <Text className="mt-4 text-center text-caption text-white">Tap to close</Text>
            </Pressable>
          </Modal>
        </>
      }
    >
      <View ref={contentRef} collapsable={false} className="gg-page pb-8 pt-2">
        {/* Where this sits in the run, and the way back to any of it. */}
        <StepTrail current="pay" onStep={goStep} canGo={(step) => step === "shop" || Boolean(lastLine)} />

        <Text className="mt-4 text-h1 text-text-primary">Your order</Text>

        {/*
          Said before anything is paid, where the client decides: an order
          placed at 9 PM waits for the morning's review, and every date below
          already counts that. Paying is not held back by it.
        */}
        {afterHours ? (
          <View className="mt-4">
            <ReviewScheduleCard
              view={afterHours}
              variant="checkout"
              hours={openingHoursLines(settings)}
              closures={afterHours.delayed ? upcomingClosures(settings?.operatingHours) : []}
            />
          </View>
        ) : null}

        {/* ---- What is being printed ------------------------------------- */}
        <View className="mt-6 gap-6" collapsable={false} ref={(node) => { fields.current.artwork = node; }}>
          {multi ? (
            <>
              {/*
                Several parts, one order (gridgo-api#117, gridgo-client#189).
                Each group is one shop GRIDGO matched — named by letter, never
                by who it is — on one date, with its own delivery fee and its
                own way to add more. Soonest date first, so the screen reads
                as what arrives when.
              */}
              <Text className="text-overline text-text-muted">{groupsHeading(groups)}</Text>
              {groups.map((group, index) => (
                <ShopGroupSection
                  key={group.id}
                  divided={index > 0}
                  group={group}
                  pickup={travel === "pickup"}
                  sharedPickupFee={totals.pickupFeeMinor != null && totals.pickupFeeMinor > 0}
                  busy={busy}
                  onAddMore={() => addToGroup(group.id, group.label, group.deadline)}
                  onChangeDate={() => changeGroupDate(group)}
                  dateError={attempted && group.deadline == null}
                >
                  {group.lines.map(lineRow)}
                </ShopGroupSection>
              ))}
            </>
          ) : runs.map((run, index) => (
            <View key={run.supplierId} className="gap-3">
              <View className="flex-row items-center justify-between gap-3">
                {/*
                  A basket splits by press, because that is what the money does:
                  one press is one run, one drop and one delivery charge. The
                  split is the client's business; whose press it is, is not. So
                  a single run is simply what GRIDGO is printing, and two are
                  numbered.
                */}
                <Text className="min-w-0 flex-1 text-overline text-text-muted">
                  {runs.length === 1
                    ? "WHAT GRIDGO IS PRINTING"
                    : `${run.runLabel.toUpperCase()} OF ${runs.length}`}
                </Text>
                <Text className="text-caption text-text-secondary">
                  {/* GRIDGO's price for the run. Null reads as "Not yet",
                      never as ₱0.00: a run with an unpriced line has no figure. */}
                  {run.clientSubtotalMinor == null ? "Not yet" : formatPhp(run.clientSubtotalMinor)}
                </Text>
              </View>

              {run.lines.map(lineRow)}

              {/*
                Same run first. Two items on one run is one print run, one drop
                and one delivery charge; the same two split across two runs is
                two of each, and this is the moment that choice is cheap to
                make.
              */}
              <Pressable
                onPress={() => addToRun(run)}
                accessibilityRole="button"
                accessibilityLabel={
                  runs.length === 1
                    ? addMoreFromLabel(SINGLE_GROUP_LABEL)
                    : `Add more to ${run.runLabel.toLowerCase()}`
                }
                className="gg-btn-secondary"
                style={({ pressed }) => (pressed ? { opacity: 0.85 } : undefined)}
              >
                <Plus size={16} color={colors.textPrimary} strokeWidth={2.5} />
                <Text className="text-button text-text-primary">
                  {runs.length === 1
                    ? addMoreFromLabel(SINGLE_GROUP_LABEL)
                    : `Add more to ${run.runLabel.toLowerCase()}`}
                </Text>
              </Pressable>
            </View>
          ))}

          <Text className="text-caption text-text-muted">{SWIPE_TO_DELETE_HINT}</Text>

          <Pressable
            onPress={() => router.push("/request/category")}
            accessibilityRole="button"
            accessibilityLabel={multi ? "Add products from any shop" : "Add something else to print"}
            className="gg-touch items-center justify-center"
            style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
          >
            <Text className="text-body text-text-secondary underline">
              {multi ? "Add products" : "Add something else to print"}
            </Text>
          </Pressable>
        </View>

        {/* ---- How it travels -------------------------------------------- */}
        <Section title="HOW IT GETS TO YOU">
          {travel === "pickup" && !hubPickupEnabled(settings) ? (
            <Text className="text-body text-error" accessibilityRole="alert">
              Hub pick-up is currently unavailable for new orders. {locked
                ? "Start a new print job and choose delivery. Your current basket is kept."
                : "Choose delivery below."}
            </Text>
          ) : null}
          {locked ? (
            <ChosenTravel
              choice={locked}
              hub={cart?.hubPickup ?? null}
              legZone={totals.legs[0] ? zoneLine(totals.legs[0].zone, totals.legs[0].distanceKm) : null}
            />
          ) : (
          <>
          <Segmented
            options={TRAVEL_CHOICES.filter((choice) => choice !== "pickup" || hubPickupEnabled(settings)).map((choice) => ({
              value: choice,
              label: travelLabel(choice),
              disabled: choice === "multi_drop",
            }))}
            value={travel}
            onChange={(next) => void setTravel(next as TravelChoice)}
            disabled={busy}
            accessibilityLabel="How your order gets to you"
          />
          <Text className="text-body text-text-secondary">{travelBlurb(travel)}</Text>
          {travel === "multi_drop" ? (
            <Text className="text-caption text-text-muted">
              Multi-drop is not offered on this order. Use Delivery for one address.
            </Text>
          ) : (
            <Text className="text-caption text-text-muted">
              Multi-drop is not offered yet.
            </Text>
          )}
          {travelCaveat(travel) && travel !== "multi_drop" ? (
            <Text className="text-caption text-text-muted">{travelCaveat(travel)}</Text>
          ) : null}

          {/*
            Collecting means one address, and it is GRIDGO's.

            This panel used to list every shop in the basket and tell the client
            to go round them. They do not: a GRIDGO rider brings each finished
            run to the office, and the client collects there. One pin, one
            label, however many presses ran the job.
          */}
          {travel === "pickup" ? (
            <CollectAtGridgo runCount={runs.length} />
          ) : (
            <>
              <Text className="text-caption text-text-muted">
                {multi
                  ? groupDeliveryNote(false)
                  : runs.length > 1
                    ? "Delivery is charged on each run, by the distance from where it is printed to your address."
                    : "Delivery is charged by the distance from where it is printed to your address."}
              </Text>
              <DeliveryZonesHelp settings={settings} />
              <View collapsable={false} ref={(node) => { fields.current.address = node; }}>
                <AddressBlock
                  cart={cart}
                  multiDrop={travel === "multi_drop"}
                  lines={lines}
                  error={
                    attempted && blockers.includes("address")
                      ? blockerLine("address")
                      : null
                  }
                  onChange={() =>
                    router.push({ pathname: "/request/where", params: { next: "checkout" } })
                  }
                />
              </View>
            </>
          )}
          </>
          )}
        </Section>

        {/* ---- Voucher ---------------------------------------------------- */}
        {/*
          Ahead of paying, because it changes what is paid: the QR amount
          below is already the total after the voucher.
        */}
        <Section title="VOUCHER">
          <CheckoutVoucher
            cartId={cartId}
            quote={cart?.clientQuote}
            isOrganization={isOrganization}
            showServiceFee={serviceFeeVisibleToClient(settings)}
            busy={busy || placing}
            onApply={applyVoucher}
            onRemove={removeVoucher}
            onCode={applyCode}
          />
        </Section>

        {/* ---- Paying ----------------------------------------------------- */}
        {noCash ? (
          <Section title="HOW YOU PAY">
            <VoucherCoveredPayment
              voucherName={discountLineLabel(cart?.clientQuote?.voucher)}
              downpaymentPercent={totals.downpaymentPercent}
              balanceMinor={totals.balanceMinor}
            />
          </Section>
        ) : (
          <Section title="HOW YOU PAY">
            {/*
              The panel is the QR. It named the method and then gave the client
              nothing to scan, which is a sheet telling someone to pay and hiding
              the code — so tapping it opens GRIDGO's own QR at a size a second
              phone can read. The screenshot and the reference stay out here,
              because those are the parts Operations matches by hand.
            */}
            <Pressable
              onPress={() => setShowQr(true)}
              accessibilityRole="button"
              accessibilityLabel="Show the GRIDGO QR to scan"
              className="gg-panel-high gg-touch gap-2"
              style={({ pressed }) => (pressed ? { opacity: 0.9 } : undefined)}
            >
              <View className="flex-row items-center justify-between gap-3">
                <Text className="text-body-lg font-medium text-text-primary">
                  {PAYMENT_CHOICE_LABEL}
                </Text>
                <View className="gg-chip">
                  <Text className="text-caption text-text-secondary">Only method</Text>
                </View>
              </View>
              <Text className="text-body text-text-secondary">{PAYMENT_CHOICE_BLURB}</Text>
              <View className="mt-1 flex-row items-center gap-2">
                <QrCode
                  size={16}
                  color={colors.textPrimary}
                  strokeWidth={2}
                  aria-hidden
                />
                <Text className="min-w-0 flex-1 text-button text-text-primary">
                  Show the QR to scan
                </Text>
                <ChevronRight
                  size={16}
                  color={colors.textMuted}
                  strokeWidth={2}
                  aria-hidden
                />
              </View>
            </Pressable>
            <Text className="text-caption text-text-muted">{DIGITAL_ONLY_NOTICE}</Text>
            {multi ? (
              <MultiShopPaymentNote groups={groups} />
            ) : (
              <Text className="text-caption text-text-muted">
                {paymentPlanNote(totals.downpaymentPercent)}
              </Text>
            )}

            {totals.downpaymentMinor != null ? (
              totals.downpaymentPercent >= FULL_PAYMENT_PERCENT ? (
                <View className="gg-card gap-1">
                  <SpecRow label="Pay in full now" value={formatPhp(totals.downpaymentMinor)} />
                </View>
              ) : (
                <View className="gg-card gap-1">
                  <SpecRow
                    label={`Send now (${totals.downpaymentPercent}%)`}
                    value={formatPhp(totals.downpaymentMinor)}
                  />
                  <SpecRow
                    label={`Before delivery (${FULL_PAYMENT_PERCENT - totals.downpaymentPercent}%)`}
                    value={totals.balanceMinor == null ? "—" : formatPhp(totals.balanceMinor)}
                  />
                </View>
              )
            ) : null}

            <View collapsable={false} ref={(node) => { fields.current.proof = node; }}>
              <PaymentProofRow
                state={proof.state}
                reading={ocrReading}
                error={attempted && blockers.includes("proof") ? blockerLine("proof") : null}
                onPick={() => void proof.pick()}
                onView={() => setViewingProof(true)}
                onReset={proof.reset}
              />
            </View>

            <View collapsable={false} ref={(node) => { fields.current.reference = node; }}>
              <FormField
                label="Payment reference"
                error={
                  ocrReading
                    ? null
                    : (attempted || referenceTouched) && !referenceCheck.ok
                      ? proof.ocr.status === "unreadable" && !reference.trim()
                        ? OCR_UNREADABLE
                        : referenceCheck.reason
                      : null
                }
                helper={
                  ocrReading
                    ? OCR_READING
                    : proof.ocr.status === "unreadable"
                      ? OCR_UNREADABLE
                      : "The reference number on the receipt from your wallet app."
                }
              >
                <View className="relative">
                  <TextField
                    value={reference}
                    onChangeText={setReference}
                    onBlur={() => setReferenceTouched(true)}
                    placeholder="e.g. 1234567890123"
                    accessibilityLabel="Payment reference"
                    autoCapitalize="characters"
                    autoCorrect={false}
                    maxLength={100}
                    editable={!ocrReading}
                  />
                  {ocrReading ? (
                    <View
                      pointerEvents="none"
                      className="absolute right-3 top-0 h-full justify-center"
                      accessibilityLabel="Reading the payment reference"
                    >
                      <ActivityIndicator size="small" color={colors.textMuted} />
                    </View>
                  ) : null}
                </View>
              </FormField>
            </View>
          </Section>
        )}

        {/* ---- Money ------------------------------------------------------ */}
        <Section title="PAYMENT DETAILS">
          {loadError ? (
            <ErrorState label="Charges not loaded" body={loadError} onRetry={() => void load()} />
          ) : null}

          <View className="gg-card gap-1">
            <SpecRow
              label="Printing"
              value={
                totals.clientItemSubtotalMinor == null
                  ? "Not yet"
                  : formatPhp(totals.clientItemSubtotalMinor)
              }
            />

            {travel === "pickup" && totals.pickupFeeMinor != null ? (
              // Collected at the hub: its flat fee, "Free" at zero. Already
              // inside the total — GRIDGO counts it in the delivery slot. A
              // basket from several shops is still charged it once.
              <SpecRow
                label={multi ? "Pick-up · once per order" : "Pick-up"}
                value={hubFeeLabel(totals.pickupFeeMinor) ?? "Not yet"}
              />
            ) : multi && travel !== "pickup" ? (
              groups.map((group) => (
                <SpecRow
                  key={group.id}
                  label={`Delivery · ${groupMoneyLabel(group, groups)}`}
                  value={group.deliveryFeeMinor == null ? "Set with your address" : formatPhp(group.deliveryFeeMinor)}
                />
              ))
            ) : travel === "pickup" ? (
              <SpecRow label="Delivery" value="None — you collect" />
            ) : totals.legs.length > 1 ? (
              totals.legs.map((leg) => (
                <SpecRow
                  key={leg.lineIds.join(",")}
                  label={`Delivery · ${leg.runLabel}`}
                  value={
                    leg.feeMinor == null
                      ? "Set with your address"
                      : withZone(formatPhp(leg.feeMinor), zoneLine(leg.zone, leg.distanceKm))
                  }
                />
              ))
            ) : (
              <SpecRow
                label="Delivery"
                value={
                  totals.deliveryFeeMinor == null
                    ? "Set with your address"
                    : withZone(
                        formatPhp(totals.deliveryFeeMinor),
                        totals.legs[0] ? zoneLine(totals.legs[0].zone, totals.legs[0].distanceKm) : null,
                      )
                }
              />
            )}

            {/* The fee is on the printing figure, so it is unknown while
                that is — never ₱0.00 for a basket with an unpriced line.
                Operations can hide the name of the fee without changing the
                pesos. */}
            {serviceFeeVisibleToClient(settings) ? (
              <ServiceFeeRow
                explainOnly
                rateBps={settings?.serviceFeeRateBps ?? null}
                pendingLabel={settings ? "Not yet" : "GRIDGO could not read its current charges"}
              />
            ) : null}

            {/* Already out of the total GRIDGO sends (#166): drawn, never subtracted. */}
            <OrganizationDiscountRow source={cart?.clientQuote} />
            {/* Already out of the total too (gridgo-api#204); the two never stack. */}
            <VoucherDiscountRow source={cart?.clientQuote} label={discountLineLabel(cart?.clientQuote?.voucher)} />

            <View className="gg-divider my-2" />

            <View className="flex-row items-baseline justify-between gap-3">
              <Text className="text-body-lg font-medium text-text-primary">Total</Text>
              <Text className="text-h3 text-text-primary">
                {totals.totalMinor == null ? "Not yet" : formatPhp(totals.totalMinor)}
              </Text>
            </View>
          </View>

          {totals.totalMinor == null && colourPriceCheck.length ? (
            <Text className="text-caption text-warning">
              A page in your order needs a price check, so there is no total yet. The shop has not
              priced that much colour on that paper, and GRIDGO never fills in a price. Operations is
              checking it with the shop; you can place the order once it is priced.
            </Text>
          ) : totals.totalMinor == null && colourUnready.length ? (
            <Text className="text-caption text-text-muted">
              The total appears once GRIDGO has measured and priced every page. Open the item&apos;s
              Artwork to see each page.
            </Text>
          ) : totals.totalMinor == null && unpriced.length ? (
            <Text className="text-caption text-text-muted">
              {unpriced.length === 1
                ? unpriced[0].listing?.pricingUnit === "per_page" && !unpriced[0].documentPages
                  ? "Upload the document before GRIDGO can calculate the total."
                  : `${lineName(unpriced[0])} has no price at its quantity, so the total lands once you change it.`
                : "Some items need attention before GRIDGO can calculate the total."}
            </Text>
          ) : totals.totalMinor == null && lines.some((line) => shopPaused(line.listing?.shopHours)) ? (
            // GRIDGO keeps the line's price but will not total or take it.
            <Text className="text-caption text-text-muted">
              A shop in your order is closed for now and is not taking new orders. Remove its items to
              see the total and place your order.
            </Text>
          ) : totals.totalMinor == null && totals.reasons.some((reason) => reason.code === "catalog_item_stale" || reason.code === "shop_unavailable") ? (
            <Text className="text-caption text-text-muted">
              Something in your order can no longer be printed as you picked it. Open it and pick
              again, or remove it.
            </Text>
          ) : totals.totalMinor == null ? (
            <Text className="text-caption text-text-muted">
              GRIDGO charges delivery by the distance from where a run is printed to your
              drop-off, so the total lands once every item has an address with a map pin.
            </Text>
          ) : null}
          <Text className="text-caption text-text-muted">
            {invoiceNote(serviceFeeVisibleToClient(settings))}
          </Text>
          <OrganizationSavingsNote source={cart?.clientQuote} />
        </Section>

        {/*
          The same box the Artwork step drew, bound to this basket: ticked
          there, it is ticked here, and the client can still take it back
          before the order is placed. Last, so it is the thing read just above
          Place order.
        */}
        {rightsScope ? (
          <Section title="YOUR ARTWORK">
            <View collapsable={false} ref={(node) => { fields.current.rights = node; }}>
              <ArtworkRightsBox
                scope={rightsScope}
                onOpen={(href) => router.push(href)}
                disabled={placing}
              />
              {attempted && blockers.includes("rights") ? (
                <Text className="text-caption text-error" accessibilityRole="alert">
                  {blockerLine("rights")}
                </Text>
              ) : null}
            </View>
          </Section>
        ) : null}

        {/*
          The approval GRIDGO keeps with the order (gridgo-client#248): what is
          being approved, then the tap or the signature. Last, because it
          covers everything above it.
        */}
        {approvalMethod && approvalScope ? (
          <Section title="APPROVE YOUR ORDER">
            <View collapsable={false} ref={(node) => { fields.current.approval = node; }}>
              <CheckoutApproval
                method={approvalMethod}
                lines={lines}
                status={approvalState}
                signature={approvalDraft?.signature ?? null}
                onTap={(approved) => {
                  setApprovalError(null);
                  if (approved) useApproval.getState().approve(approvalScope, reviewedVersion);
                  else useApproval.getState().withdraw(approvalScope);
                }}
                onSign={() => {
                  setApprovalError(null);
                  router.push({ pathname: "/approval/sign", params: { scope: approvalScope, reviewed: reviewedVersion } });
                }}
                error={
                  approvalError ??
                  (attempted && (blockers.includes("approval") || blockers.includes("approval_signature"))
                    ? blockerLine(blockers.includes("approval") ? "approval" : "approval_signature")
                    : null)
                }
                disabled={placing}
              />
            </View>
          </Section>
        ) : null}

      </View>

    </FormScreen>
  );
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

/** "₱25.00 · Nearby" — the fee, then the zone it was priced in. */
function withZone(fee: string, zone: string | null): string {
  return zone ? `${fee} · ${zone}` : fee;
}

/**
 * Why a multi-shop order is paid in full, said where the client pays rather
 * than discovered on the QR. Info, not warning: nothing is wrong.
 */
function MultiShopPaymentNote({ groups }: { groups: ShopGroupView[] }) {
  const colors = useThemeColors();
  return (
    <View
      className="gg-panel flex-row gap-3"
      accessible
      accessibilityLabel={`${MULTI_SHOP_PAYMENT_TITLE}. ${multiShopPaymentNote(groups)}`}
    >
      <Info size={18} color={colors.info} strokeWidth={2} aria-hidden />
      <View className="min-w-0 flex-1 gap-1">
        <Text className="text-body font-medium text-text-primary">{MULTI_SHOP_PAYMENT_TITLE}</Text>
        <Text className="text-caption text-text-secondary">{multiShopPaymentNote(groups)}</Text>
      </View>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View className="mt-10 gap-3">
      <Text className="text-overline text-text-muted">{title}</Text>
      {children}
    </View>
  );
}

/**
 * One thing in the basket: what it is, what it costs, and how to change it.
 *
 * The whole row opens the listing it came from. That is what a client reaches
 * for first — they tap the thing they want to change — and it was the one
 * gesture the row did not answer.
 *
 * Removing is a swipe, and a swipe alone never removes anything: the caller is
 * handed the line and puts a question in front of it.
 *
 * The action bar underneath carries what a tap on the row cannot say on its
 * own — the quantity, and a labelled way to each of the two screens. Its
 * labels wrap rather than truncate. "Add artw…" is not a control; it is a
 * control that has run out of room, and the fix is room rather than a shorter
 * word for artwork.
 */
function LineRow({
  line,
  artwork,
  serviceFeeRateBps,
  busy,
  onStalePhoto,
  onEdit,
  onArtwork,
  onQuantity,
  onRemove,
}: {
  line: CartLineRecord;
  /** Where this line's artwork stands with GRIDGO's check; null when it is fine. */
  artwork: LineArtworkStatus | null;
  /** GRIDGO's rate; null while the charges are unread, and then no figure. */
  serviceFeeRateBps: number | null;
  busy: boolean;
  /** Re-reads the basket when this line's sample link has expired. */
  onStalePhoto: () => Promise<void>;
  onEdit: () => void;
  onArtwork: () => void;
  onQuantity: (next: number) => void;
  onRemove: () => void;
}) {
  const options = lineOptionLabels(line).join(" · ");
  const name = lineName(line);
  const readyBy = readyByDate(line.promiseBy);
  const clientAmount = clientLineAmountMinor(line, serviceFeeRateBps);
  // Closed for now: GRIDGO will not take this line, whatever it is priced at.
  const paused = shopPaused(line.listing?.shopHours);
  const layout = lineLayoutSummary(line);
  const coverSpine = coverSpineLineSummary(line);
  // Priced or checked by colour: the sheets, the pages' colour, the warning.
  const colour = line.colourPricing
    ? {
        sheets: sheetsLine(line.quantityMode, line.quantity, linePageCount(line), line.colourPricing.totalSheets ?? line.totalSheets),
        summary: linePricedByColour(line) ? colourSummary(line.colourPricing) : null,
        warning: oneColourWarning(line.colourPricing),
      }
    : null;
  const unit = line.quantityMode ? quantityUnit(line.quantityMode, 1) : null;

  return (
    <SwipeToRemove label={name} onRemove={onRemove} disabled={busy}>
      <View className="gg-card-flush bg-surface">
        <Pressable
          onPress={onEdit}
          accessibilityRole="button"
          accessibilityLabel={`${name}. Change what you picked.${readyBy ? ` Ready by ${readyBy}. ${READY_TIME_EXPLANATION}` : ""}`}
          className="gg-touch"
          style={({ pressed }) => (pressed ? { opacity: 0.85 } : undefined)}
        >
          <View className="flex-row gap-3 p-3">
            <View className="w-16">
              <SamplePhoto
                url={samplePhotoUri(line.listing?.photos?.[0])}
                expiresAt={line.listing?.photos?.[0]?.downloadUrlExpiresAt}
                onStale={onStalePhoto}
                altText={name}
                gutter="tight"
                emptyLabel="No sample"
              />
            </View>
            <View className="min-w-0 flex-1 gap-1">
              <Text className="text-body-lg font-medium text-text-primary">{name}</Text>
              {paused ? (
                <View className="gap-1">
                  <ShopHoursLine view={shopHoursView(line.listing?.shopHours)} />
                  <Text className="text-caption text-warning">{SHOP_PAUSED_LINE}</Text>
                </View>
              ) : null}
              <ReadyTime promiseBy={line.promiseBy} />
              {options ? (
                <Text className="text-caption text-text-muted" numberOfLines={2}>
                  {options}
                </Text>
              ) : null}
              {colour ? (
                <>
                  {colour.sheets ? <Text className="text-caption text-text-secondary">{colour.sheets}</Text> : null}
                  {colour.summary ? <Text className="text-caption text-text-muted">{colour.summary}</Text> : null}
                  {colour.warning ? <Text className="text-caption text-warning">{colour.warning}</Text> : null}
                </>
              ) : line.documentPages ? (
                <Text className="text-caption text-text-secondary">{documentPagesSummary(line.documentPages)}</Text>
              ) : null}
              {/* The note as GRIDGO stored it, contacts already hidden. Edit reopens it. */}
              {line.specialInstructions?.trim() ? (
                <Text className="text-caption text-text-secondary" numberOfLines={3}>
                  Note: {line.specialInstructions.trim()}
                </Text>
              ) : null}
              {clientAmount == null ? (
                <Text className="text-caption text-warning">{unpricedLineReason(line)}</Text>
              ) : (
                <Text className="text-body text-text-secondary">
                  {clientAmount == null ? "—" : formatPhp(clientAmount)}
                </Text>
              )}
              <Text
                className={
                  lineHasArtwork(line) ? "text-caption text-text-muted" : "text-caption text-warning"
                }
              >
                {lineArtworkSummary(line)}
              </Text>
              {artwork ? (
                <Text
                  className={artwork.kind === "problem" ? "text-caption text-error" : "text-caption text-text-secondary"}
                  accessibilityLiveRegion="polite"
                >
                  {artwork.text}
                </Text>
              ) : null}
              {layout ? (
                <Text className={layout.tone === "warning" ? "text-caption text-warning" : "text-caption text-text-muted"}>
                  {layout.text}
                </Text>
              ) : null}
              {coverSpine ? (
                <Text
                  className={coverSpine.tone === "warning" ? "text-caption text-warning" : "text-caption text-text-muted"}
                  numberOfLines={3}
                >
                  {coverSpine.text}
                </Text>
              ) : null}
            </View>
          </View>
        </Pressable>

        <View className="flex-row items-stretch border-t border-outline-subtle">
          <View className="flex-row items-center">
            <IconAction
              icon="minus"
              label={unit ? `One fewer ${unit} of ${name}` : `One fewer ${name}`}
              disabled={busy || line.quantity <= 1}
              onPress={() => onQuantity(line.quantity - 1)}
            />
            <Text className="min-w-8 text-center text-body font-medium text-text-primary">
              {line.quantity}
            </Text>
            <IconAction
              icon="plus"
              label={unit ? `One more ${unit} of ${name}` : `One more ${name}`}
              disabled={busy}
              onPress={() => onQuantity(line.quantity + 1)}
            />
          </View>

          <View className="w-px self-stretch bg-outline-subtle" />
          <RowAction label="Edit" onPress={onEdit} />
          <View className="w-px self-stretch bg-outline-subtle" />
          <RowAction
            label={lineHasArtwork(line) ? "Artwork" : "Add artwork"}
            onPress={onArtwork}
          />
        </View>
      </View>
    </SwipeToRemove>
  );
}

/**
 * A labelled way to one screen.
 *
 * No `numberOfLines`: on a narrow phone "Add artwork" wraps onto two lines,
 * which is legible, and truncates to "Add artw…", which is not.
 */
function RowAction({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      className="gg-touch min-w-0 flex-1 items-center justify-center px-2 py-3"
      style={({ pressed }) => (pressed ? { opacity: 0.6 } : undefined)}
    >
      <Text className="text-center text-button text-text-primary">{label}</Text>
    </Pressable>
  );
}

/**
 * Where a collected order is collected from: GRIDGO's own counter.
 *
 * This panel used to name every shop in the basket and send the client round
 * them, which is the wrong product. GRIDGO is the counter — the rider brings
 * each finished run to the office and the client collects there — so however
 * many presses ran the job, there is exactly one pin here. Two office pins
 * would be the same mistake in a smaller size.
 *
 * The map link is the honest way to give a pin on a form: a static tile inside
 * a scrolling checkout sheet is a picture of a map, and what a person actually
 * wants at this point is directions in the app they already use.
 */
function CollectAtGridgo({ runCount }: { runCount: number }) {
  const colors = useThemeColors();

  return (
    <View className="gg-panel gap-3">
      <View className="flex-row items-start gap-2">
        <MapPin
          size={16}
          color={colors.textPrimary}
          strokeWidth={2}
          aria-hidden
        />
        <View className="min-w-0 flex-1 gap-0.5">
          <Text className="text-body font-medium text-text-primary">
            {GRIDGO_OFFICE_LABEL}
          </Text>
          <Text className="text-caption text-text-muted">{GRIDGO_OFFICE.locality}</Text>
          <Text className="text-caption text-text-muted">{gridgoOfficeCoordLine()}</Text>
        </View>
      </View>

      <Text className="text-caption text-text-muted">
        {GRIDGO_OFFICE_BLURB}
        {runCount > 1
          ? " Every run comes here, so there is still only one place to go."
          : ""}
      </Text>

      <Pressable
        onPress={() => void Linking.openURL(gridgoOfficeMapUrl())}
        accessibilityRole="button"
        accessibilityLabel="Open GRIDGO Office in Maps"
        className="gg-touch flex-row items-center gap-1 self-start"
        style={({ pressed }) => (pressed ? { opacity: 0.6 } : undefined)}
      >
        <Text className="text-button text-text-primary">Open in Maps</Text>
        <ChevronRight
          size={16}
          color={colors.textMuted}
          strokeWidth={2.5}
          aria-hidden
        />
      </Pressable>
    </View>
  );
}

/**
 * Delivery or pick-up as chosen before the match (#158), read back.
 *
 * Not a control: the printer was matched for this point, and GRIDGO refuses a
 * different one on this basket (`request_fulfillment_locked`). So it is stated,
 * with the one honest way to change it.
 */
function ChosenTravel({
  choice,
  hub,
  legZone,
}: {
  choice: api.RequestFulfilment;
  hub: api.HubPickup | null;
  legZone: string | null;
}) {
  const colors = useThemeColors();
  const pickup = choice.fulfillmentMode === "pickup";
  return (
    <View className="gap-3">
      {pickup ? (
        <HubPickupPanel hub={hub} showFee={false} />
      ) : (
        <View className="gg-card-flush flex-row items-start gap-3 p-4" accessible>
          <Truck size={18} color={colors.textPrimary} strokeWidth={2} aria-hidden />
          <View className="min-w-0 flex-1 gap-0.5">
            <Text className="text-body-lg font-medium text-text-primary">Delivery</Text>
            <Text className="text-caption text-text-muted" numberOfLines={2}>
              {choice.dropoff?.label ?? fulfilmentSummary(choice)}
            </Text>
            {legZone ? <Text className="text-caption text-text-secondary">{legZone}</Text> : null}
          </View>
        </View>
      )}
      <Text className="text-caption text-text-muted">
        {pickup ? "You chose pick-up" : "You chose delivery"} before GRIDGO matched your printer. To
        change it, start a new order.
      </Text>
    </View>
  );
}

function IconAction({
  icon,
  label,
  disabled,
  onPress,
}: {
  icon: "minus" | "plus";
  label: string;
  disabled: boolean;
  onPress: () => void;
}) {
  const colors = useThemeColors();
  const Icon = icon === "minus" ? Minus : Plus;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      className={
        disabled
          ? "gg-touch gg-disabled items-center justify-center px-3 py-3"
          : "gg-touch items-center justify-center px-3 py-3"
      }
      style={({ pressed }) => (pressed && !disabled ? { opacity: 0.6 } : undefined)}
    >
      <Icon size={16} color={colors.textPrimary} strokeWidth={2.5} />
    </Pressable>
  );
}

/**
 * Where it goes.
 *
 * A missing pin is called out, because that — not the written address — is what
 * the delivery charge is measured from, and its absence is the reason the total
 * below says "Not yet".
 */
function AddressBlock({
  cart,
  multiDrop,
  lines,
  error,
  onChange,
}: {
  cart: api.Cart | null;
  multiDrop: boolean;
  lines: CartLineRecord[];
  error: string | null;
  onChange: () => void;
}) {
  const fallback = cart?.defaultDropoff ?? null;

  return (
    <View className="gap-3">
      <View className={error ? "gg-card-flush border border-error" : "gg-card-flush"}>
        <Pressable
          onPress={onChange}
          accessibilityRole="button"
          accessibilityLabel={fallback ? "Change the delivery address" : "Set the delivery address"}
          className="gg-touch flex-row items-center gap-3 p-4"
        >
          {({ pressed }) => (
            <>
              <View className="min-w-0 flex-1 gap-0.5">
                <Text className="text-body-lg font-medium text-text-primary">
                  {multiDrop ? "Default address" : "Delivery address"}
                </Text>
                <Text
                  className={error ? "text-caption text-error" : "text-caption text-text-muted"}
                  numberOfLines={2}
                >
                  {error ?? fallback?.label ?? "Not set yet"}
                </Text>
              </View>
              <Text className="text-button text-text-primary">{fallback ? "Change" : "Set"}</Text>
              {pressed ? (
                <View pointerEvents="none" className="gg-pressed absolute inset-0" />
              ) : null}
            </>
          )}
        </Pressable>
      </View>

      {multiDrop ? (
        <View className="gg-panel gap-3">
          <Text className="text-caption text-text-muted">
            Each item goes to its own address. Anything without one goes to the default above.
          </Text>
          {lines.map((line) => (
            <View key={line.id} className="gap-0.5">
              <Text className="text-body font-medium text-text-primary">{lineName(line)}</Text>
              <Text className="text-caption text-text-muted" numberOfLines={2}>
                {line.dropoff?.label ?? fallback?.label ?? "No address yet"}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

/**
 * One row of mutually exclusive choices.
 *
 * Monochrome: the selected segment is the accent, never the action yellow. The
 * yellow on this screen belongs to Place order, and a sheet with four yellow
 * things on it has no primary action at all. An unavailable segment stays on
 * the row, dimmed and unpressable, so a client can see GRIDGO knows about it.
 */
function Segmented({
  options,
  value,
  onChange,
  disabled,
  accessibilityLabel,
}: {
  options: { value: string; label: string; disabled?: boolean }[];
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  accessibilityLabel: string;
}) {
  return (
    <View
      className="flex-row gap-2"
      accessibilityRole="radiogroup"
      accessibilityLabel={accessibilityLabel}
    >
      {options.map((option) => {
        const selected = option.value === value;
        const off = option.disabled || disabled;
        return (
          <Pressable
            key={option.value}
            onPress={() => !off && onChange(option.value)}
            disabled={off}
            accessibilityRole="radio"
            accessibilityState={{ selected, disabled: off }}
            accessibilityLabel={option.label}
            className={
              option.disabled
                ? "gg-chip gg-touch gg-disabled min-w-0 flex-1 justify-center bg-surface px-3"
                : selected
                  ? "gg-chip gg-touch min-w-0 flex-1 justify-center border-accent bg-accent px-3"
                  : "gg-chip gg-touch min-w-0 flex-1 justify-center bg-surface px-3"
            }
            style={({ pressed }) => (pressed && !off ? { opacity: 0.9 } : undefined)}
          >
            <Text
              className={
                selected && !option.disabled
                  ? "text-button text-accent-on"
                  : "text-button text-text-secondary"
              }
              numberOfLines={1}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
