import { useLiveRefresh } from "@/hooks/useLiveRefresh";
import { ChevronRight, Home, MapPin, Minus, Plus, QrCode } from "lucide-react-native";
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

import { ConfirmDialog } from "@/components/ConfirmDialog";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { FormScreen } from "@/components/FormScreen";
import { paymentQrFromSettings, QrPaySheet } from "@/components/QrPaySheet";
import { PaymentProofRow } from "@/components/PaymentProofRow";
import { FormField } from "@/components/form/FormField";
import { TextField } from "@/components/form/TextField";
import { SamplePhoto } from "@/components/SamplePhoto";
import { ServiceFeeRow } from "@/components/ServiceFeeRow";
import { SpecRow } from "@/components/SpecRow";
import { StepTrail } from "@/components/StepTrail";
import { SwipeToRemove } from "@/components/SwipeToRemove";
import { useThemeColors } from "@/hooks/useTheme";
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
} from "@/lib/basket";
import { gridgoPriceOrNull, unpricedLineReason } from "@/lib/clientPrice";
import { openReceiptAfterCheckout } from "@/lib/receipt";
import { clearOrderFlow } from "@/lib/orderFlow";
import {
  blockerLine,
  fulfilmentModeFor,
  INVOICE_NOTE,
  PAYMENT_CHOICE_BLURB,
  PAYMENT_CHOICE_LABEL,
  PAYMENT_SPLIT_NOTE,
  placeOrderBlockers,
  SWIPE_TO_DELETE_HINT,
  travelBlurb,
  travelCaveat,
  travelChoiceOf,
  travelLabel,
  TRAVEL_CHOICES,
  type TravelChoice,
} from "@/lib/checkout";
import { userFacingError } from "@/lib/copy";
import {
  GRIDGO_OFFICE,
  GRIDGO_OFFICE_BLURB,
  GRIDGO_OFFICE_LABEL,
  gridgoOfficeCoordLine,
  gridgoOfficeMapUrl,
} from "@/lib/gridgoOffice";
import { samplePhotoUri } from "@/lib/listing";
import { orderFlowNow } from "@/lib/orderFlow";
import { type OrderStepId } from "@/lib/orderSteps";
import { checkPaymentReference, DIGITAL_ONLY_NOTICE } from "@/lib/payment";
import {
  OCR_READING,
  OCR_UNREADABLE,
} from "@/lib/receiptOcr";
import { formatDistance, type GeoPoint } from "@/lib/tracking";
import { useCart } from "@/store/cart";
import { usePlatformSettings } from "@/store/platformSettings";
import { useCheckoutPayment } from "@/store/checkoutPayment";

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
 * Placing the order sends the 75% QR reference and its receipt. That is
 * submitted, never taken: no money moves through GRIDGO, Operations matches the
 * reference by hand, and nothing on this sheet may read as paid.
 */
export default function CheckoutScreen() {
  const router = useRouter();
  const colors = useThemeColors();

  const cart = useCart((state) => state.cart);
  const cartId = useCart((state) => state.cartId);
  const loading = useCart((state) => state.loading);
  const hydrated = useCart((state) => state.hydrated);
  const busy = useCart((state) => state.busy);
  const loadCart = useCart((state) => state.load);
  const autofillDropoff = useCart((state) => state.autofillDropoff);
  const run = useCart((state) => state.run);
  const adopt = useCart((state) => state.adopt);
  const clearCart = useCart((state) => state.clear);

  const [settings, setSettings] = useState<api.PlatformSettings | null>(null);
  const [shops, setShops] = useState<Record<string, api.ShopBoard>>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [referenceTouched, setReferenceTouched] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [placeError, setPlaceError] = useState<string | null>(null);
  const [showQr, setShowQr] = useState(false);
  const [viewingProof, setViewingProof] = useState(false);
  // The line a swipe or a Remove tap has asked about. Nothing leaves the
  // basket until this is answered.
  const [removing, setRemoving] = useState<CartLineRecord | null>(null);
  const scrollRef = useRef<{ scrollTo?: (opts: { y: number; animated?: boolean }) => void }>(null);
  const contentRef = useRef<View>(null);
  const fields = useRef<Partial<Record<"artwork" | "address" | "proof" | "reference", View | null>>>({});

  const proof = usePaymentProof(cartId);
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

  useLiveRefresh(["orders", "catalog", "settings"], load, { refreshOnFocus: false });

  useFocusEffect(
    useCallback(() => {
      void load();
      return () => { loadSequence.current++; };
    }, [load]),
  );

  // Each run's own pin, so delivery can be measured. The board also carries the
  // shop's name; it is deliberately never read. GRIDGO is who the client is
  // buying from, and a run is named by its position in the basket.
  const supplierIds = useMemo(
    () => [...new Set((cart?.lines ?? []).map((line) => line.supplierId))].sort(),
    [cart],
  );
  const supplierKey = supplierIds.join(",");

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      void (async () => {
        const boards = await Promise.all(
          supplierIds.map(async (supplierId) => {
            try {
              return await api.getCatalogShop(supplierId);
            } catch {
              return null;
            }
          }),
        );
        if (!alive) return;
        setShops(
          Object.fromEntries(
            boards.filter((board): board is api.ShopBoard => board !== null).map((board) => [board.supplierId, board]),
          ),
        );
      })();
      return () => {
        alive = false;
      };
    }, [supplierKey]), // eslint-disable-line react-hooks/exhaustive-deps
  );

  const shopPoints = useMemo<Record<string, GeoPoint | null>>(
    () =>
      Object.fromEntries(
        Object.entries(shops).map(([supplierId, board]) => [
          supplierId,
          board.shop ? { lat: board.shop.lat, lng: board.shop.lng } : null,
        ]),
      ),
    [shops],
  );

  const lines = useMemo(() => cart?.lines ?? [], [cart]);
  const feeRateBps = settings?.serviceFeeRateBps ?? 0;
  const runs = useMemo(() => printRuns(lines, feeRateBps), [lines, feeRateBps]);
  const totals = useMemo(
    () => basketTotals({ cart, settings, shopPoints }),
    [cart, settings, shopPoints],
  );

  const travel = travelChoiceOf(cart);
  const unpriced = linesUnpriced(lines);
  const missingArtwork = linesMissingArtwork(lines);
  const referenceCheck = checkPaymentReference(reference);
  const ocrReading = proof.ocr.status === "reading";
  const blockers = placeOrderBlockers({
    lineCount: lines.length,
    linesUnpriced: unpriced.length,
    linesMissingArtwork: missingArtwork.length,
    linesMissingDropoff: linesMissingDropoff(cart).length,
    referenceOk: ocrReading || referenceCheck.ok,
    hasProof: Boolean(proof.state.fileId),
    hasSettings: Boolean(settings),
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
      blocker === "artwork" || blocker === "price"
        ? "artwork"
        : blocker === "address"
          ? "address"
          : blocker === "proof"
            ? "proof"
            : blocker === "reference"
              ? "reference"
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
    if (blockers.length) {
      setAttempted(true);
      if (blockers.includes("reference")) setReferenceTouched(true);
      scrollToBlocker(blockers[0]);
      return;
    }
    void place();
  };

  const place = async () => {
    if (blockers.length || ocrReading || placing || !cartId || !proof.state.fileId) return;
    setPlacing(true);
    setPlaceError(null);
    try {
      // The cart already carries when the job is wanted. Checkout does not
      // ask again. A basket with no level at all is the platform default.
      if (!cart?.serviceLevel) {
        await api.setCartFulfilment(cartId, { serviceLevel: "standard" });
      }
      const { order } = await api.checkoutCart(cartId, {
        reference: reference.trim(),
        proofFileId: proof.state.fileId,
      });
      resetPayment();
      clearCart();
      clearOrderFlow();
      openReceiptAfterCheckout(router, order.id);
    } catch (e) {
      setPlaceError(
        userFacingError(
          e,
          "GRIDGO could not place your order. Nothing was charged — your order is still here, so try again.",
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

  const placeLocked = ocrReading || placing || busy;
  const missingShown = attempted || referenceTouched;

  return (
    <FormScreen
      scrollRef={scrollRef}
      footer={
        <View testID="checkout-footer" className="gap-3 border-t border-outline bg-surface px-4 pb-2 pt-3">
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
                accessibilityElementsHidden
                importantForAccessibility="no"
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
            className={placeError || (missingShown && blockers.length)
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
                      blockers[0] === "price"
                        ? unpriced.length === 1
                          ? lineName(unpriced[0])
                          : undefined
                        : missingArtwork.length === 1
                          ? lineName(missingArtwork[0])
                          : undefined,
                    )
                : "Your order goes to Operations for artwork checking.")}
          </Text>
        </View>
      }
      /* Beside the scroll, never inside it — see `FormScreen`'s `overlay`. */
      overlay={
        <>
          <QrPaySheet
            open={showQr}
            onClose={() => setShowQr(false)}
            downpaymentMinor={totals.downpaymentMinor}
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

        {/* ---- What is being printed ------------------------------------- */}
        <View className="mt-6 gap-6" collapsable={false} ref={(node) => { fields.current.artwork = node; }}>
          {runs.map((run, index) => (
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
                  {(() => {
                    // GRIDGO's price for the run. Null reads as "Not yet",
                    // never as ₱0.00: a run with an unpriced line has no figure.
                    const priced = gridgoPriceOrNull(run.subtotalMinor, settings?.serviceFeeRateBps);
                    return priced == null ? "Not yet" : formatPhp(priced);
                  })()}
                </Text>
              </View>

              {run.lines.map((line) => (
                <LineRow
                  key={line.id}
                  line={line}
                  serviceFeeRateBps={settings?.serviceFeeRateBps ?? null}
                  busy={busy}
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
              ))}

              {/*
                Same run first. Two items on one run is one print run, one drop
                and one delivery charge; the same two split across two runs is
                two of each, and this is the moment that choice is cheap to
                make.
              */}
              <Pressable
                onPress={() => router.push("/request/category")}
                accessibilityRole="button"
                accessibilityLabel={
                  runs.length === 1
                    ? "Add more to this print run"
                    : `Add more to ${run.runLabel.toLowerCase()}`
                }
                className="gg-btn-secondary"
                style={({ pressed }) => (pressed ? { opacity: 0.85 } : undefined)}
              >
                <Plus size={16} color={colors.textPrimary} strokeWidth={2.5} />
                <Text className="text-button text-text-primary">
                  {runs.length === 1 ? "Add more to this run" : `Add more to ${run.runLabel.toLowerCase()}`}
                </Text>
              </Pressable>
            </View>
          ))}

          <Text className="text-caption text-text-muted">{SWIPE_TO_DELETE_HINT}</Text>

          <Pressable
            onPress={() => router.push("/request/category")}
            accessibilityRole="button"
            accessibilityLabel="Add something else to print"
            className="gg-touch items-center justify-center"
            style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
          >
            <Text className="text-body text-text-secondary underline">
              Add something else to print
            </Text>
          </Pressable>
        </View>

        {/* ---- How it travels -------------------------------------------- */}
        <Section title="HOW IT GETS TO YOU">
          <Segmented
            options={TRAVEL_CHOICES.map((choice) => ({
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
                {runs.length > 1
                  ? "Delivery is charged on each run, by the distance from where it is printed to your address."
                  : "Delivery is charged by the distance from where it is printed to your address."}
              </Text>
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
        </Section>

        {/* ---- Paying ----------------------------------------------------- */}
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
                accessibilityElementsHidden
                importantForAccessibility="no"
              />
              <Text className="min-w-0 flex-1 text-button text-text-primary">
                Show the QR to scan
              </Text>
              <ChevronRight
                size={16}
                color={colors.textMuted}
                strokeWidth={2}
                accessibilityElementsHidden
                importantForAccessibility="no"
              />
            </View>
          </Pressable>
          <Text className="text-caption text-text-muted">{DIGITAL_ONLY_NOTICE}</Text>
          <Text className="text-caption text-text-muted">{PAYMENT_SPLIT_NOTE}</Text>

          {totals.downpaymentMinor != null ? (
            <View className="gg-card gap-1">
              <SpecRow
                label="Send now (75%)"
                value={formatPhp(totals.downpaymentMinor)}
              />
              <SpecRow
                label="Before delivery (25%)"
                value={totals.balanceMinor == null ? "—" : formatPhp(totals.balanceMinor)}
              />
            </View>
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

            {travel === "pickup" ? (
              <SpecRow label="Delivery" value="None — you collect" />
            ) : totals.legs.length > 1 ? (
              totals.legs.map((leg) => (
                <SpecRow
                  key={leg.supplierId}
                  label={`Delivery · ${leg.runLabel}`}
                  value={
                    leg.feeMinor == null
                      ? "Set with your address"
                      : `${formatPhp(leg.feeMinor)}${
                          leg.distanceMeters != null
                            ? ` · ${formatDistance(leg.distanceMeters / 1000)}`
                            : ""
                        }`
                  }
                />
              ))
            ) : (
              <SpecRow
                label="Delivery"
                value={
                  totals.deliveryFeeMinor == null
                    ? "Set with your address"
                    : formatPhp(totals.deliveryFeeMinor)
                }
              />
            )}

            {/* The fee is on the printing figure, so it is unknown while
                that is — never ₱0.00 for a basket with an unpriced line. */}
            <ServiceFeeRow
              explainOnly
              rateBps={settings?.serviceFeeRateBps ?? null}
              pendingLabel={settings ? "Not yet" : "GRIDGO could not read its current charges"}
            />

            <View className="gg-divider my-2" />

            <View className="flex-row items-baseline justify-between gap-3">
              <Text className="text-body-lg font-medium text-text-primary">Total</Text>
              <Text className="text-h3 text-text-primary">
                {totals.totalMinor == null ? "Not yet" : formatPhp(totals.totalMinor)}
              </Text>
            </View>
          </View>

          {totals.totalMinor == null && unpriced.length ? (
            <Text className="text-caption text-text-muted">
              {unpriced.length === 1
                ? `${lineName(unpriced[0])} has no price at its quantity, so the total lands once you change it.`
                : "Some items have no price at their quantity, so the total lands once you change them."}
            </Text>
          ) : totals.totalMinor == null ? (
            <Text className="text-caption text-text-muted">
              GRIDGO charges delivery by the distance from where a run is printed to your
              drop-off, so the total lands once every item has an address with a map pin.
            </Text>
          ) : null}
          <Text className="text-caption text-text-muted">{INVOICE_NOTE}</Text>
        </Section>

      </View>

    </FormScreen>
  );
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

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
  serviceFeeRateBps,
  busy,
  onEdit,
  onArtwork,
  onQuantity,
  onRemove,
}: {
  line: CartLineRecord;
  /** GRIDGO's rate; null while the charges are unread, and then no figure. */
  serviceFeeRateBps: number | null;
  busy: boolean;
  onEdit: () => void;
  onArtwork: () => void;
  onQuantity: (next: number) => void;
  onRemove: () => void;
}) {
  const options = lineOptionLabels(line).join(" · ");
  const name = lineName(line);
  const priced = gridgoPriceOrNull(line.lineSubtotalMinor, serviceFeeRateBps);
  const clientAmount =
    priced ?? (serviceFeeRateBps == null ? null : clientLineAmountMinor(line, serviceFeeRateBps));

  return (
    <SwipeToRemove label={name} onRemove={onRemove} disabled={busy}>
      <View className="gg-card-flush bg-surface">
        <Pressable
          onPress={onEdit}
          accessibilityRole="button"
          accessibilityLabel={`${name}. Change what you picked.`}
          className="gg-touch"
          style={({ pressed }) => (pressed ? { opacity: 0.85 } : undefined)}
        >
          <View className="flex-row gap-3 p-3">
            <View className="w-16">
              <SamplePhoto
                url={samplePhotoUri(line.listing?.photos?.[0])}
                altText={name}
                gutter="tight"
                emptyLabel="No sample"
              />
            </View>
            <View className="min-w-0 flex-1 gap-1">
              <Text className="text-body-lg font-medium text-text-primary">{name}</Text>
              {options ? (
                <Text className="text-caption text-text-muted" numberOfLines={2}>
                  {options}
                </Text>
              ) : null}
              {line.lineSubtotalMinor == null ? (
                <Text className="text-caption text-warning">{unpricedLineReason(line)}</Text>
              ) : (
                <Text className="text-body text-text-secondary">
                  {clientAmount == null ? "—" : formatPhp(clientAmount)}
                </Text>
              )}
              <Text
                className={
                  line.artworkFileId ? "text-caption text-text-muted" : "text-caption text-warning"
                }
              >
                {line.artworkFileId ? "Artwork attached" : "No artwork yet"}
              </Text>
            </View>
          </View>
        </Pressable>

        <View className="flex-row items-stretch border-t border-outline-subtle">
          <View className="flex-row items-center">
            <IconAction
              icon="minus"
              label={`One fewer ${name}`}
              disabled={busy || line.quantity <= 1}
              onPress={() => onQuantity(line.quantity - 1)}
            />
            <Text className="min-w-8 text-center text-body font-medium text-text-primary">
              {line.quantity}
            </Text>
            <IconAction
              icon="plus"
              label={`One more ${name}`}
              disabled={busy}
              onPress={() => onQuantity(line.quantity + 1)}
            />
          </View>

          <View className="w-px self-stretch bg-outline-subtle" />
          <RowAction label="Edit" onPress={onEdit} />
          <View className="w-px self-stretch bg-outline-subtle" />
          <RowAction
            label={line.artworkFileId ? "Artwork" : "Add artwork"}
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
          accessibilityElementsHidden
          importantForAccessibility="no"
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
          accessibilityElementsHidden
          importantForAccessibility="no"
        />
      </Pressable>
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
