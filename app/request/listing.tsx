import { useLiveRefresh } from "@/hooks/useLiveRefresh";
import { Minus, Plus } from "lucide-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useLocalSearchParams, useRouter } from "expo-router";

import { Screen } from "@/components/Screen";
import { KEYBOARD_CARET_GAP } from "@/components/FormScreen";
import { ErrorScreenState } from "@/components/ErrorState";
import { GridgoPrice } from "@/components/GridgoPrice";
import { OptionGroupPicker } from "@/components/OptionGroupPicker";
import { SamplePhoto } from "@/components/SamplePhoto";
import { SkeletonBlock, SkeletonLine } from "@/components/Skeleton";
import { StepTrailBar } from "@/components/StepTrail";
import { useThemeColors } from "@/hooks/useTheme";
import * as api from "@/lib/api";
import { type CatalogItem, type MeasureUnit, type MeasurementKind } from "@/lib/api";
import {
  EMPTY_MEASUREMENT,
  belowMinimumOrder,
  fromMilli,
  isMeasurementComplete,
  lineTotalMinor,
  measurementKind,
  measurementPrompt,
  measurementSummary,
  minimumApplies,
  toDraft,
  toMeasurement,
  unitWord,
  type MeasurementDraft,
} from "@/lib/measurement";
import { gridgoAmountMinor } from "@/lib/gridgoPrice";
import {
  addOnGroups,
  boundValue,
  clientUnitPriceMinor,
  firstMissingGroup,
  fileFormats,
  formatSentence,
  isSelectionComplete,
  linkFormats,
  quantityLine,
  readyInLine,
  samplePhotoUri,
  selectedOptionIds,
  specGroups,
  unitLine,
  unitPriceMinor,
  type ListingSelection,
} from "@/lib/listing";
import { userFacingError } from "@/lib/copy";
import { isFullListing, listingNow, takeListing } from "@/lib/listingCache";
import { orderFlowNow } from "@/lib/orderFlow";
import { type OrderStepId } from "@/lib/orderSteps";
import { useCart } from "@/store/cart";
import { usePlatformSettings } from "@/store/platformSettings";

const MAX_QUANTITY = 500;

/** Where the quantity starts: the least the shop will run, or one. */
function orderFloor(item: CatalogItem | null): number {
  return item?.minimumOrderQuantity ?? 1;
}

/**
 * GRIDGO's order sheet for one thing, filled in.
 *
 * Same reading as the preview a shop sees of its own listing in
 * gridgo-supplier: sample, price, ready-in, what to do before ordering, the
 * numbered steps, then the extras. The difference is that here the boxes tick
 * and the price moves — and the price it moves to is GRIDGO's, the shop figure
 * plus the live service fee, not the press's own rate. Whose press it is stays
 * GRIDGO's business: the eyebrow over the name says GRIDGO, because GRIDGO is
 * who the client is buying from.
 *
 * Nothing is pre-ticked. A sheet that opens with A5 already chosen shows a
 * price the client has not agreed to, and the whole point of the steps is that
 * the shop needs each answer before it can print.
 *
 * The one yellow control in the whole match-and-configure flow is at the bottom
 * of this screen, because this is where a client commits to something.
 */
export default function ListingScreen() {
  const router = useRouter();
  const { itemId, lineId } = useLocalSearchParams<{
    itemId?: string;
    /** Present when reopening a basket row to change it. */
    lineId?: string;
  }>();

  const cart = useCart((state) => state.cart);
  const run = useCart((state) => state.run);
  const adopt = useCart((state) => state.adopt);
  const warmCart = useCart((state) => state.warm);
  const editing = lineId ? cart?.lines.find((line) => line.id === lineId) ?? null : null;

  const [item, setItem] = useState<CatalogItem | null>(
    () => listingNow(itemId) ?? (isFullListing(editing?.listing) ? editing.listing : null),
  );
  const [error, setError] = useState<string | null>(null);
  const [selection, setSelection] = useState<ListingSelection>({});
  const [quantity, setQuantity] = useState(1);
  // How big it is. Only three of the six pricing units ask for this, and the
  // listing itself decides which — a client ordering flyers never sees it.
  const [measured, setMeasured] = useState<MeasurementDraft>(EMPTY_MEASUREMENT);
  const [showMissing, setShowMissing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [feeRateBps, setFeeRateBps] = useState<number | null>(null);

  const loadSequence = useRef(0);
  const load = useCallback(() => {
    const sequence = ++loadSequence.current;
    if (!itemId) return;
    const cached = listingNow(itemId);
    const listing = takeListing(itemId).then((read) => {
      if (sequence !== loadSequence.current) return;
      setItem(read);
      setError(null);
    }).catch((e) => {
      if (sequence !== loadSequence.current) return;
      // A failed refresh must not blank a sheet the match already painted.
      if (listingNow(itemId) || cached) return;
      setItem(null);
      setError(
        userFacingError(
          e,
          "GRIDGO could not open this listing. It may have been taken down — go back and pick another.",
        ),
      );
    });
    const settings = api.getSettings().then((read) => {
      if (sequence !== loadSequence.current) return;
      if (Number.isInteger(read.serviceFeeRateBps)) setFeeRateBps(read.serviceFeeRateBps);
    }).catch(() => {
      // The sheet can still price from the listing's own GRIDGO fields.
    });
    return Promise.all([listing, settings]);
  }, [itemId]);

  useLiveRefresh(["catalog", "services", "settings"], load);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Invalidate the latest request on cleanup; this ref is a sequence counter, not a node.
    return () => { loadSequence.current++; };
  }, [load]);

  /*
    Get the basket out of the way while the client is still ticking options.

    "Add to my order" was two calls deep — create the basket, then put the line
    in it — and the first has nothing to do with anything chosen on this screen.
    Started here, it is long finished by the time anyone taps, so the tap costs
    one round trip and the button stops sitting on "Saving…". A second visit
    already holds a basket and this does nothing at all.
  */
  useEffect(() => {
    warmCart();
  }, [warmCart]);

  // Reopening a basket row starts from what was already answered on it, so a
  // client changing the paper does not have to pick the size again.
  const [restoredFrom, setRestoredFrom] = useState<{
    lineId?: string;
    itemId?: string;
  }>({});
  if (restoredFrom.lineId !== editing?.id || restoredFrom.itemId !== item?.id) {
    setRestoredFrom({ lineId: editing?.id, itemId: item?.id });
    if (editing && item) {
      const restored: ListingSelection = {};
      for (const group of item.optionGroups) {
        const chosen = group.options.find((option) => editing.optionIds.includes(option.id));
        if (chosen) restored[group.id] = chosen.id;
      }
      setSelection(restored);
      setQuantity(editing.quantity);
      setMeasured(toDraft(editing.measurement));
    } else if (item) {
      // A fresh sheet opens at the least the shop will run. Opening at one
      // with a note underneath let a quantity GRIDGO cannot price into the
      // basket, where it showed as "—" and a total of delivery alone.
      setQuantity((current) => Math.max(current, orderFloor(item)));
    }
  }

  // GRIDGO's rate, so the price on this sheet is what the client will pay.
  // Normally already held from launch; a sheet opened cold reads it here.
  const loadSettings = usePlatformSettings((state) => state.load);
  useEffect(() => {
    loadSettings().catch(() => {
      /* The price waits on its skeleton rather than showing the shop's own. */
    });
  }, [loadSettings]);

  /**
   * Back to GRIDGO's pick for this job, or to the start of choosing what to
   * print.
   *
   * `navigate` rather than `push`: the match screen is already underneath this
   * one, and pushing a second copy would leave the client two backs from where
   * they think they are.
   */
  const goStep = (step: OrderStepId) => {
    if (step !== "shop") return;
    const flow = orderFlowNow();
    if (!flow) {
      router.navigate("/request/category");
      return;
    }
    router.navigate({
      pathname: "/request/match",
      params: { subcategory: flow.subcategoryCode, category: flow.categoryCode },
    });
  };

  if (error) {
    return (
      <Screen edges={["bottom"]}>
        <ErrorScreenState
          label="This listing did not open"
          body={error}
          onRetry={() => void load()}
        />
      </Screen>
    );
  }

  if (!item) {
    return (
      <Screen edges={["bottom"]}>
        <StepTrailBar current="listing" onStep={goStep} />
        <View
          className="gg-page gap-4 pt-4"
          accessibilityRole="progressbar"
          accessibilityLabel="Opening the listing"
        >
          <SkeletonBlock className="h-56 w-full rounded-card" />
          <SkeletonLine width="w-2/3" height="h-7" />
          <SkeletonLine width="w-1/3" height="h-6" />
          <SkeletonLine width="w-full" />
        </View>
      </Screen>
    );
  }

  const specs = specGroups(item);
  const addOns = addOnGroups(item);
  const complete = isSelectionComplete(item, selection);
  const missing = firstMissingGroup(item, selection);
  const shopUnit = unitPriceMinor(item, selection);
  const kind = measurementKind(item);
  const measurement = toMeasurement(kind, measured);
  // Shop first, then GRIDGO's fee — the same order checkout uses. Null while a
  // measured listing has no measurement yet. Drawn as "—" rather than as zero,
  // because a zero in the price line reads as free.
  const shopTotal = lineTotalMinor(item, quantity, measurement, shopUnit);
  const unit =
    feeRateBps == null
      ? (item.clientEffectivePriceMinor ?? item.clientFromPriceMinor ?? shopUnit)
      : clientUnitPriceMinor(item, selection, feeRateBps);
  const total =
    shopTotal == null
      ? null
      : feeRateBps == null
        ? shopTotal
        : gridgoAmountMinor(shopTotal, feeRateBps);
  const sized = isMeasurementComplete(item, measured);
  const atMinimum = minimumApplies(item, measurement);
  const runMinimum = belowMinimumOrder(item, quantity);
  const uploads = fileFormats(item);
  const links = linkFormats(item);
  const ready = readyInLine(item.turnaroundHours);

  const add = async () => {
    if (busy) return;
    if (!complete || !sized) {
      setShowMissing(true);
      return;
    }
    setBusy(true);
    setSaveError(null);
    try {
      // A line reopened after the shop raised its minimum can still sit under
      // it. GRIDGO would refuse the save; say so here, in the same words.
      if (runMinimum) {
        setSaveError(`This shop takes orders of ${runMinimum} and up. Change the quantity first.`);
        return;
      }
      const optionIds = selectedOptionIds(item, selection);
      const structuredSpec = {
        size: boundValue(item, selection, "size"),
        material: boundValue(item, selection, "material"),
        finish: boundValue(item, selection, "finish"),
      };
      if (editing) {
        const updated = await run((cartId) =>
          api.updateCartLine(cartId, editing.id, { optionIds, quantity, structuredSpec, measurement }),
        );
        setBusy(false);
        adopt(updated);
        router.back();
        return;
      }
      const updated = await run((cartId) =>
        api.addCartLine(cartId, {
          catalogItemId: item.id,
          optionIds,
          quantity,
          structuredSpec,
          measurement,
        }),
      );
      const added = updated.lines.at(-1);
      if (!added?.id) {
        throw new Error("GRIDGO did not return the new line.");
      }
      // Leave as soon as the line exists. Compact add is the basket; a fat
      // re-hydrate or photo signing is what kept the control on "Saving…".
      setBusy(false);
      adopt(updated);
      router.replace({ pathname: "/request/artwork", params: { lineId: added.id } });
    } catch (e) {
      setSaveError(
        userFacingError(
          e,
          "GRIDGO could not add this to your order. Check your connection and try again.",
        ),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen edges={["bottom"]}>
      {/* Fixed under the header: the trail is how a client gets back, so it
          must not scroll away with the sheet it is describing. */}
      <StepTrailBar current="listing" onStep={goStep} />

      {/*
        Keyboard-aware rather than plain, because a measured listing asks the
        client to type a size. Not `FormScreen`: the commit bar has to stay
        outside the scroll — it is what shows the running total while the sheet
        is being filled in, and inside the scroll it would leave with it.
      */}
      <KeyboardAwareScrollView
        className="gg-screen"
        contentContainerClassName="pb-8"
        bottomOffset={KEYBOARD_CARET_GAP}
        keyboardShouldPersistTaps="handled"
      >
        <View className="bg-surface-variant px-2 pt-2">
          <SamplePhoto
            url={samplePhotoUri(item.photos[0])}
            altText={item.photos[0]?.altText ?? item.name}
            ratio="wide"
            emptyLabel="No sample photo"
          />
        </View>

        {item.photos.length > 1 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} className="bg-surface-variant">
            <View className="flex-row px-1 pb-1">
              {item.photos.slice(1).map((photo) => (
                <View key={photo.fileId} className="w-20">
                  <SamplePhoto
                    url={samplePhotoUri(photo)}
                    altText={photo.altText ?? item.name}
                    gutter="tight"
                  />
                </View>
              ))}
            </View>
          </ScrollView>
        ) : null}

        <View className="gg-page pt-6">
          {/* The storefront this sheet belongs to. Never the press behind it. */}
          <Text className="text-caption text-text-muted">GRIDGO</Text>
          <Text className="mt-1 text-h2 text-text-primary">{item.name}</Text>

          {/* GRIDGO's price for one unit as configured — the shop's figure
              plus GRIDGO's charge, never the shop's figure on its own. */}
          <View className="mt-3 flex-row items-baseline gap-2">
            <GridgoPrice
              supplierMinor={unit}
              className="text-h1 text-text-primary"
              waitingWidth="w-28"
            />
            <Text className="text-body text-text-secondary">{unitLine(item)}</Text>
          </View>
          {ready ? (
            <Text className="mt-1 text-body text-text-secondary">{ready}</Text>
          ) : null}

          {item.description ? (
            <Text className="mt-6 text-body text-text-secondary">{item.description}</Text>
          ) : null}

          {item.prepSteps.length ? (
            <View className="mt-8 gap-3">
              <Text className="text-overline text-text-muted">BEFORE YOU ORDER</Text>
              <View className="gg-panel gap-4">
                {item.prepSteps.map((step, position) => (
                  <View key={step.id} className="flex-row gap-3">
                    <Text className="text-body font-bold text-text-muted">
                      {position + 1}
                    </Text>
                    <View className="min-w-0 flex-1 gap-1">
                      <Text className="text-body font-medium text-text-primary">
                        {step.title}
                      </Text>
                      {step.body ? (
                        <Text className="text-caption text-text-secondary">{step.body}</Text>
                      ) : null}
                    </View>
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          {specs.map((group, position) => (
            <View key={group.id} className="mt-8">
              <OptionGroupPicker
                group={group}
                step={position + 1}
                selectedId={selection[group.id]}
                onSelect={(optionId) =>
                  setSelection((current) => {
                    const next = { ...current };
                    if (optionId) next[group.id] = optionId;
                    else delete next[group.id];
                    return next;
                  })
                }
              />
            </View>
          ))}

          {addOns.length ? (
            <View className="mt-10 gap-6">
              <Text className="text-overline text-text-muted">ADD ANYTHING ELSE</Text>
              {addOns.map((group) => (
                <OptionGroupPicker
                  key={group.id}
                  group={group}
                  step={null}
                  selectedId={selection[group.id]}
                  onSelect={(optionId) =>
                    setSelection((current) => {
                      const next = { ...current };
                      if (optionId) next[group.id] = optionId;
                      else delete next[group.id];
                      return next;
                    })
                  }
                />
              ))}
            </View>
          ) : null}

          {/*
            How big it is, asked only where the shop prices by size. It sits
            above the quantity because the two mean different things here and
            reading them the other way round invites the classic mistake: a
            client who puts 15 in the quantity because the banner is 15 square
            feet buys fifteen banners.
          */}
          {kind !== "none" ? (
            <View className="mt-10 gap-3">
              <Text className="text-overline text-text-muted">
                {kind === "pages" ? "HOW MANY PAGES" : "HOW BIG"}
              </Text>
              <MeasurementFields
                kind={kind}
                unit={item.measureUnit}
                draft={measured}
                onChange={setMeasured}
              />
              {measurement ? (
                <Text className="text-body text-text-secondary">
                  {measurementSummary(item, measurement)}
                </Text>
              ) : (
                <Text className="text-body text-text-secondary">
                  {measurementPrompt(kind, item.measureUnit)}
                </Text>
              )}
              {atMinimum ? (
                <Text className="text-caption text-text-muted">
                  This shop charges a minimum of{" "}
                  {kind === "area"
                    ? `${fromMilli(item.minimumWidthMilli)} × ${fromMilli(item.minimumHeightMilli)} ${unitWord(item.measureUnit)}`
                    : `${fromMilli(item.minimumLengthMilli)} ${unitWord(item.measureUnit)}`}
                  , so that is what this is priced at. A smaller job uses the same material.
                </Text>
              ) : null}
            </View>
          ) : null}

          <View className="mt-10 gap-3">
            <Text className="text-overline text-text-muted">HOW MANY</Text>
            <Stepper
              value={quantity}
              min={orderFloor(item)}
              onChange={setQuantity}
              caption={quantityLine(item, quantity)}
            />
            {orderFloor(item) > 1 ? (
              <Text
                className={
                  runMinimum ? "text-caption text-warning" : "text-caption text-text-muted"
                }
              >
                This shop takes orders of {orderFloor(item)} and up.
              </Text>
            ) : null}
          </View>

          <View className="mt-10 gap-2">
            <Text className="text-overline text-text-muted">SEND YOUR ARTWORK AS</Text>
            {uploads.length ? (
              <Text className="text-body text-text-secondary">
                Upload {formatSentence(uploads)}.
              </Text>
            ) : null}
            {links.length ? (
              <Text className="text-body text-text-secondary">
                Or paste a link from {formatSentence(links)}.
              </Text>
            ) : null}
            {!uploads.length && !links.length ? (
              <Text className="text-body text-text-secondary">
                GRIDGO has not published what artwork this takes. Operations will ask you for
                it.
              </Text>
            ) : null}
          </View>
        </View>
      </KeyboardAwareScrollView>

      {/*
        The commit bar. It stays on screen because the sheet is longer than a
        phone and the running total is the thing a client keeps checking as they
        tick — scrolling back to the top to see what it costs is how people lose
        track of what they picked.
      */}
      <View className="border-t border-outline bg-surface px-4 pb-2 pt-3">
        <View className="flex-row items-baseline justify-between gap-3">
          <Text className="text-body text-text-secondary">
            {quantityLine(item, quantity)}
          </Text>
          <GridgoPrice
            supplierMinor={total}
            className="text-h3 text-text-primary"
            waitingWidth="w-24"
          />
        </View>

        <Pressable
          onPress={() => void add()}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel={editing ? "Save this change" : "Add to my order"}
          accessibilityState={{ disabled: busy }}
          className={busy ? "gg-btn-primary gg-disabled mt-3" : "gg-btn-primary mt-3"}
          style={({ pressed }) => (pressed && !busy ? { opacity: 0.9 } : undefined)}
        >
          <Text className="text-button text-action-yellow-on">
            {busy ? "Saving…" : editing ? "Save this change" : "Add to my order"}
          </Text>
        </Pressable>

        <Text
          className={
            saveError
              ? "mt-2 text-center text-caption text-error"
              : "mt-2 text-center text-caption text-text-muted"
          }
        >
          {saveError
            ? saveError
            : showMissing && missing
              ? `Pick a ${missing.name.toLowerCase()} first.`
              : "Delivery is added at checkout."}
        </Text>
      </View>
    </Screen>
  );
}

/**
 * How many.
 *
 * Its own control rather than the catalog stepper, because a listing's unit is
 * the shop's — a pack of 100, a piece, a square metre it named itself — and the
 * caption under the buttons is what turns "3" into something a client can check.
 */
/**
 * The one or two numbers a measured listing needs.
 *
 * Plain numeric fields rather than a stepper: a banner is 3.5 feet as readily
 * as 3, and a stepper forces a client to guess what one press is worth. The
 * unit is the shop's own and is stated beside the field rather than offered as
 * a choice — a shop that prices in feet does not want a number in millimetres,
 * and converting silently is how a 5-metre banner becomes a 5-foot one.
 */
function MeasurementFields({
  kind,
  unit,
  draft,
  onChange,
}: {
  kind: MeasurementKind;
  unit: MeasureUnit | null;
  draft: MeasurementDraft;
  onChange: (next: MeasurementDraft) => void;
}) {
  if (kind === "pages") {
    return (
      <MeasureInput
        value={draft.pages}
        onChange={(pages) => onChange({ ...draft, pages })}
        suffix="pages"
        label="How many pages"
        wholeNumbers
      />
    );
  }
  if (kind === "length") {
    return (
      <MeasureInput
        value={draft.length}
        onChange={(length) => onChange({ ...draft, length })}
        suffix={unitWord(unit)}
        label="How long it is"
      />
    );
  }
  return (
    <View className="flex-row items-center gap-3">
      <View className="min-w-0 flex-1">
        <MeasureInput
          value={draft.width}
          onChange={(width) => onChange({ ...draft, width })}
          suffix={unitWord(unit)}
          label="How wide it is"
        />
      </View>
      <Text className="text-body-lg text-text-muted">×</Text>
      <View className="min-w-0 flex-1">
        <MeasureInput
          value={draft.height}
          onChange={(height) => onChange({ ...draft, height })}
          suffix={unitWord(unit)}
          label="How tall it is"
        />
      </View>
    </View>
  );
}

function MeasureInput({
  value,
  onChange,
  suffix,
  label,
  wholeNumbers = false,
}: {
  value: string;
  onChange: (next: string) => void;
  suffix: string;
  label: string;
  wholeNumbers?: boolean;
}) {
  return (
    <View className="gg-field flex-row items-center">
      <TextInput
        value={value}
        onChangeText={(text) =>
          // Only what a measurement can be made of. A stray letter here is a
          // field that silently reads as no size at all.
          onChange(text.replace(wholeNumbers ? /[^0-9]/g : /[^0-9.]/g, ""))
        }
        keyboardType={wholeNumbers ? "number-pad" : "decimal-pad"}
        placeholder="0"
        accessibilityLabel={label}
        className="min-w-0 flex-1 text-body-lg text-text-primary"
        style={{ paddingStart: 16, paddingEnd: 8, includeFontPadding: false }}
      />
      <Text className="pe-4 text-body text-text-muted">{suffix}</Text>
    </View>
  );
}

function Stepper({
  value,
  min = 1,
  onChange,
  caption,
}: {
  value: number;
  /** The least the shop will run; the minus stops here. */
  min?: number;
  onChange: (next: number) => void;
  caption: string;
}) {
  const atMin = value <= min;
  const atMax = value >= MAX_QUANTITY;

  return (
    <View className="gap-2">
      <View className="flex-row items-center gap-4">
        <StepButton
          icon="minus"
          disabled={atMin}
          label="One fewer"
          onPress={() => onChange(Math.max(min, value - 1))}
        />
        <Text className="min-w-16 text-center text-h2 text-text-primary">{value}</Text>
        <StepButton
          icon="plus"
          disabled={atMax}
          label="One more"
          onPress={() => onChange(Math.min(MAX_QUANTITY, value + 1))}
        />
      </View>
      <Text className="text-caption text-text-muted">
        {caption}
        {atMax ? ` · ${MAX_QUANTITY} is the most you can order in one line` : ""}
      </Text>
    </View>
  );
}

function StepButton({
  icon,
  disabled,
  label,
  onPress,
}: {
  icon: "minus" | "plus";
  disabled: boolean;
  label: string;
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
          ? "gg-btn-secondary gg-disabled h-11 w-11 px-0"
          : "gg-btn-secondary h-11 w-11 px-0"
      }
      style={({ pressed }) => (pressed && !disabled ? { opacity: 0.8 } : undefined)}
    >
      <Icon size={18} color={colors.textPrimary} strokeWidth={2.5} />
    </Pressable>
  );
}
