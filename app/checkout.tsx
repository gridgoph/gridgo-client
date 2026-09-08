import { useLiveRefresh } from "@/hooks/useLiveRefresh";
import { Check, ChevronRight, MapPin, Minus, Plus, QrCode, Trash2 } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Linking, Pressable, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";

import { ConfirmDialog } from "@/components/ConfirmDialog";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { FormScreen } from "@/components/FormScreen";
import { paymentQrFromSettings, QrPaySheet } from "@/components/QrPaySheet";
import { ReceiptOcrHost } from "@/components/ReceiptOcrHost";
import { FormField } from "@/components/form/FormField";
import { TextField } from "@/components/form/TextField";
import { SamplePhoto } from "@/components/SamplePhoto";
import { SpecRow } from "@/components/SpecRow";
import { StepTrail } from "@/components/StepTrail";
import { SwipeToRemove } from "@/components/SwipeToRemove";
import { useThemeColors } from "@/hooks/useTheme";
import { usePaymentProof } from "@/hooks/usePaymentProof";
import * as api from "@/lib/api";
import { formatPhp, type CartLineRecord } from "@/lib/api";
import {
  basketTotals,
  lineName,
  lineOptionLabels,
  linesMissingArtwork,
  linesMissingDropoff,
  printRuns,
} from "@/lib/basket";
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
  nextReferenceFromOcr,
} from "@/lib/receiptOcr";
import { formatDistance, type GeoPoint } from "@/lib/tracking";
import { useCart } from "@/store/cart";

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
  const run = useCart((state) => state.run);
  const adopt = useCart((state) => state.adopt);
  const clearCart = useCart((state) => state.clear);

  const [settings, setSettings] = useState<api.PlatformSettings | null>(null);
  const [shops, setShops] = useState<Record<string, api.ShopBoard>>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reference, setReference] = useState("");
  const [referenceTouched, setReferenceTouched] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [placeError, setPlaceError] = useState<string | null>(null);
  const [showQr, setShowQr] = useState(false);
  // The line a swipe or a Remove tap has asked about. Nothing leaves the
  // basket until this is answered.
  const [removing, setRemoving] = useState<CartLineRecord | null>(null);

  const proof = usePaymentProof();

  useEffect(() => {
    if (proof.ocr.status === "idle" || proof.ocr.status === "reading") return;
    setReference((current) => nextReferenceFromOcr(current, proof.ocr));
  }, [proof.ocr]);

  const load = useCallback(async () => {
    await loadCart();
    try {
      setSettings(await api.getSettings());
      setLoadError(null);
    } catch (e) {
      setSettings(null);
      setLoadError(
        userFacingError(
          e,
          "GRIDGO could not read its current charges. Your order is safe — try again in a moment.",
        ),
      );
    }
  }, [loadCart]);

  useLiveRefresh(["orders", "catalog", "settings"], load);

  useFocusEffect(
    useCallback(() => {
      void load();
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
  const runs = useMemo(() => printRuns(lines), [lines]);
  const totals = useMemo(
    () => basketTotals({ cart, settings, shopPoints }),
    [cart, settings, shopPoints],
  );

  const travel = travelChoiceOf(cart);
  const missingArtwork = linesMissingArtwork(lines);
  const referenceCheck = checkPaymentReference(reference);
  const blockers = placeOrderBlockers({
    lineCount: lines.length,
    linesMissingArtwork: missingArtwork.length,
    linesMissingDropoff: linesMissingDropoff(cart).length,
    referenceOk: referenceCheck.ok,
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

  const place = async () => {
    if (blockers.length || placing || !cartId || !proof.state.fileId) return;
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
      clearCart();
      router.replace({ pathname: "/order/[id]", params: { id: order.id } });
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

  return (
    <FormScreen
      /* Beside the scroll, never inside it — see `FormScreen`'s `overlay`. */
      overlay={
        <>
          <QrPaySheet
            open={showQr}
            onClose={() => setShowQr(false)}
            downpaymentMinor={totals.downpaymentMinor}
            imageUrl={paymentQrFromSettings(settings)?.imageUrl ?? null}
          />
          <ReceiptOcrHost />

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
        </>
      }
    >
      <View className="gg-page pb-8 pt-2">
        {/* Where this sits in the run, and the way back to any of it. */}
        <StepTrail current="pay" onStep={goStep} canGo={(step) => step === "shop" || Boolean(lastLine)} />

        <Text className="mt-4 text-h1 text-text-primary">Your order</Text>

        {/* ---- What is being printed ------------------------------------- */}
        <View className="mt-6 gap-6">
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
                  {formatPhp(run.subtotalMinor)}
                </Text>
              </View>

              {run.lines.map((line) => (
                <LineRow
                  key={line.id}
                  line={line}
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
            }))}
            value={travel}
            onChange={(next) => void setTravel(next as TravelChoice)}
            disabled={busy}
            accessibilityLabel="How your order gets to you"
          />
          <Text className="text-body text-text-secondary">{travelBlurb(travel)}</Text>
          {travelCaveat(travel) ? (
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
              <AddressBlock
                cart={cart}
                multiDrop={travel === "multi_drop"}
                lines={lines}
                onChange={() =>
                  router.push({ pathname: "/request/where", params: { next: "checkout" } })
                }
              />
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

          <ProofRow
            state={proof.state}
            onPick={() => void proof.pick()}
            onReset={proof.reset}
          />

          <FormField
            label="Payment reference"
            error={referenceTouched && !referenceCheck.ok ? referenceCheck.reason : null}
            helper={
              proof.ocr.status === "reading"
                ? OCR_READING
                : proof.ocr.status === "unreadable"
                  ? OCR_UNREADABLE
                  : "The reference number on the receipt from your wallet app."
            }
          >
            <TextField
              value={reference}
              onChangeText={setReference}
              onBlur={() => setReferenceTouched(true)}
              placeholder="e.g. 1234567890123"
              accessibilityLabel="Payment reference"
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={100}
            />
          </FormField>
        </Section>

        {/* ---- Money ------------------------------------------------------ */}
        <Section title="PAYMENT DETAILS">
          {loadError ? (
            <ErrorState label="Charges not loaded" body={loadError} onRetry={() => void load()} />
          ) : null}

          <View className="gg-card gap-1">
            <SpecRow label="Items" value={formatPhp(totals.itemSubtotalMinor)} />

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

            <View className="gg-divider my-2" />

            <View className="flex-row items-baseline justify-between gap-3">
              <Text className="text-body-lg font-medium text-text-primary">Total</Text>
              <Text className="text-h3 text-text-primary">
                {totals.totalMinor == null ? "Not yet" : formatPhp(totals.totalMinor)}
              </Text>
            </View>
          </View>

          {totals.totalMinor == null ? (
            <Text className="text-caption text-text-muted">
              GRIDGO charges delivery by the distance from where a run is printed to your
              drop-off, so the total lands once every item has an address with a map pin.
            </Text>
          ) : null}
          <Text className="text-caption text-text-muted">{INVOICE_NOTE}</Text>
        </Section>

        {/* ---- Place it --------------------------------------------------- */}
        <View className="mt-8 gap-3">
          {placeError ? (
            <ErrorState
              label="Not sent"
              body={placeError}
              retryLabel="Try again"
              onRetry={() => void place()}
            />
          ) : null}

          <Pressable
            onPress={() => void place()}
            disabled={blockers.length > 0 || placing || busy}
            accessibilityRole="button"
            accessibilityLabel="Place this order"
            accessibilityState={{ disabled: blockers.length > 0 || placing || busy }}
            className={
              blockers.length || placing || busy
                ? "gg-btn-primary gg-disabled"
                : "gg-btn-primary"
            }
            style={({ pressed }) =>
              pressed && !blockers.length && !placing && !busy ? { opacity: 0.9 } : undefined
            }
          >
            <Text className="text-button text-action-yellow-on">
              {placing ? "Placing your order…" : "Place order"}
            </Text>
          </Pressable>

          <Text className="text-center text-caption text-text-muted">
            {blockers.length
              ? blockerLine(
                  blockers[0],
                  missingArtwork.length === 1 ? lineName(missingArtwork[0]) : undefined,
                )
              : "Your order goes to Operations for artwork checking."}
          </Text>

          <Pressable
            onPress={() => router.replace("/(tabs)/home")}
            accessibilityRole="button"
            accessibilityLabel="Go to Home and keep this order"
            className="gg-btn-secondary"
            style={({ pressed }) => (pressed ? { opacity: 0.85 } : undefined)}
          >
            <Text className="text-button text-text-primary">Home</Text>
          </Pressable>
          <Text className="text-center text-caption text-text-muted">
            Leaving keeps everything here — it is waiting when you come back.
          </Text>
        </View>
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
  busy,
  onEdit,
  onArtwork,
  onQuantity,
  onRemove,
}: {
  line: CartLineRecord;
  busy: boolean;
  onEdit: () => void;
  onArtwork: () => void;
  onQuantity: (next: number) => void;
  onRemove: () => void;
}) {
  const options = lineOptionLabels(line).join(" · ");
  const name = lineName(line);

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
              <Text className="text-body text-text-secondary">
                {line.lineSubtotalMinor == null ? "—" : formatPhp(line.lineSubtotalMinor)}
              </Text>
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
 * The receipt screenshot.
 *
 * Checkout will not take the order without it, so it is asked for here rather
 * than after the button refuses. Progress is honest: the bar filling means the
 * bytes left the phone, and only a file id back from GRIDGO is a tick.
 */
function ProofRow({
  state,
  onPick,
  onReset,
}: {
  state: ReturnType<typeof usePaymentProof>["state"];
  onPick: () => void;
  onReset: () => void;
}) {
  const colors = useThemeColors();
  const sending = state.phase === "sending";

  return (
    <View className="gg-card gap-3">
      <View className="flex-row items-center justify-between gap-3">
        <Text className="min-w-0 flex-1 text-body-lg font-medium text-text-primary">
          Payment screenshot
        </Text>
        {state.phase === "stored" ? (
          <View className="gg-chip">
            <Check size={13} color={colors.success} strokeWidth={2.5} />
            <Text className="text-caption text-text-secondary">Uploaded</Text>
          </View>
        ) : null}
      </View>

      <Text
        className={
          state.phase === "failed" ? "text-caption text-error" : "text-caption text-text-muted"
        }
      >
        {state.phase === "empty"
          ? "The screenshot of your QR transfer, so Operations can match it."
          : state.phase === "sending"
            ? state.progress == null
              ? "Sending your screenshot…"
              : `Sending your screenshot — ${Math.round(state.progress * 100)}%.`
            : state.phase === "stored"
              ? state.fileName
              : (state.error ?? "That screenshot did not reach GRIDGO.")}
      </Text>

      <View className="flex-row gap-2">
        <Pressable
          onPress={onPick}
          disabled={sending}
          accessibilityRole="button"
          accessibilityLabel={
            state.phase === "stored" ? "Choose a different screenshot" : "Add the screenshot"
          }
          accessibilityState={{ disabled: sending }}
          className={sending ? "gg-btn-secondary gg-disabled flex-1" : "gg-btn-secondary flex-1"}
          style={({ pressed }) => (pressed && !sending ? { opacity: 0.85 } : undefined)}
        >
          <Text className="text-button text-text-primary">
            {state.phase === "stored" ? "Choose another" : "Add screenshot"}
          </Text>
        </Pressable>
        {state.phase === "stored" ? (
          <Pressable
            onPress={onReset}
            accessibilityRole="button"
            accessibilityLabel="Remove the screenshot"
            className="gg-btn-secondary px-4"
            style={({ pressed }) => (pressed ? { opacity: 0.85 } : undefined)}
          >
            <Trash2 size={16} color={colors.textMuted} strokeWidth={2} />
          </Pressable>
        ) : null}
      </View>
    </View>
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
  onChange,
}: {
  cart: api.Cart | null;
  multiDrop: boolean;
  lines: CartLineRecord[];
  onChange: () => void;
}) {
  const fallback = cart?.defaultDropoff ?? null;

  return (
    <View className="gap-3">
      <View className="gg-card-flush">
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
                <Text className="text-caption text-text-muted" numberOfLines={2}>
                  {fallback?.label ?? "Not set yet"}
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
