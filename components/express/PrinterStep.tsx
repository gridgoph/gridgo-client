import { BadgeCheck, Bike, Check, Info, MapPin, Star, Store, House, Zap } from "lucide-react-native";
import { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { Pressable } from "@/components/Pressable";

import { ChoiceChips, ExpressRow } from "@/components/express/ExpressChrome";
import { PlaceSheet } from "@/components/express/PaySheets";
import { PrinterMap } from "@/components/express/PrinterMap";
import { ErrorState } from "@/components/ErrorState";
import { SkeletonBlock } from "@/components/Skeleton";
import { useThemeColors } from "@/hooks/useTheme";
import * as api from "@/lib/api";
import { readyLine, type ExpressFulfilment } from "@/lib/express";
import { HOME_PICKUP_BEFORE_PAYMENT, homeBarangay, homeDistanceLine, printerName, printerPhrase } from "@/lib/homePrinter";
import {
  A3_PICK_YOURSELF,
  fareLimitOptions,
  printerStatus,
  reachLine,
  selectableFirst,
  shopPrintingPrice,
  sortOptions,
  usesShopPrices,
  validSort,
  widenedLine,
  zoneLine,
} from "@/lib/whoPrints";
import { nothingFits } from "@/lib/printerMap";
import { expressChoices, useExpress } from "@/store/express";
import { usePlatformSettings } from "@/store/platformSettings";
import { choicesKey } from "@/lib/express";

/** A small toggle pill for sorts and filters: ink when on, never yellow. */
function Pill({
  label,
  selected,
  onPress,
  role,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  role: "radio" | "checkbox";
}) {
  const colors = useThemeColors();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole={role}
      accessibilityState={role === "radio" ? { selected } : { checked: selected }}
      accessibilityLabel={label}
      className="gg-touch justify-center"
    >
      <View
        className={
          selected
            ? "h-9 flex-row items-center gap-1.5 rounded-pill border border-accent bg-accent px-3.5"
            : "h-9 flex-row items-center gap-1.5 rounded-pill border border-outline bg-surface px-3.5"
        }
      >
        {role === "checkbox" && selected ? <Check size={14} color={colors.accentOn} strokeWidth={2.5} aria-hidden /> : null}
        <Text className={selected ? "text-body font-medium text-accent-on" : "text-body font-medium text-text-primary"}>{label}</Text>
      </View>
    </Pressable>
  );
}

/**
 * "Just print it": the choice for a client who does not mind who prints,
 * only how far GRIDGO may go for the fare. Selected by default.
 */
function JustPrintIt({ bands }: { bands: api.DeliveryFeeBand[] }) {
  const colors = useThemeColors();
  const fareLimit = useExpress((state) => state.fareLimit);
  const fulfilment = useExpress((state) => state.fulfilment);
  const prints = useExpress((state) => state.prints);
  const shopPrices = usesShopPrices(prints);
  const selected = fareLimit != null && !shopPrices;
  const options = fareLimitOptions(bands, fulfilment);
  return (
    <View
      className={
        selected
          ? "gap-3 rounded-card border-2 border-accent bg-surface-high p-4"
          : "gap-3 rounded-card border-2 border-outline bg-surface p-4"
      }
      style={shopPrices ? { opacity: 0.6 } : undefined}
    >
      <Pressable
        onPress={() => useExpress.getState().setFareLimit(fareLimit ?? "nearby")}
        disabled={shopPrices}
        accessibilityRole="radio"
        accessibilityState={{ selected, disabled: shopPrices }}
        accessibilityLabel={`Just print it. GRIDGO picks the fastest printer.${shopPrices ? ` ${A3_PICK_YOURSELF}` : ""}`}
        className="flex-row items-center gap-3"
      >
        <View className="h-10 w-10 items-center justify-center rounded-pill bg-action-yellow">
          <Zap size={20} color={colors.actionYellowOn} fill={colors.actionYellowOn} strokeWidth={2} aria-hidden />
        </View>
        <View className="min-w-0 flex-1">
          <Text className="text-h3 text-text-primary">Just print it</Text>
          <Text className="text-body text-text-secondary">
            {shopPrices ? A3_PICK_YOURSELF : "GRIDGO picks the fastest printer for you."}
          </Text>
        </View>
        {selected ? <Check size={20} color={colors.textPrimary} strokeWidth={2.5} aria-hidden /> : null}
      </Pressable>
      {selected ? (
        <View className="gap-1.5">
          <Text className="text-caption text-text-muted">
            {fulfilment === "delivery" ? "Delivery fare up to" : "How far it can be"}
          </Text>
          <ChoiceChips
            label={fulfilment === "delivery" ? "Delivery fare limit" : "How far the printer can be"}
            options={options}
            value={fareLimit as api.ExpressFareLimit}
            onChange={(next) => useExpress.getState().setFareLimit(next)}
          />
        </View>
      ) : null}
    </View>
  );
}

function VerificationTag({ level }: { level: string | undefined }) {
  const colors = useThemeColors();
  if (level === "verified") {
    return (
      <View className="flex-row items-center gap-1" accessible accessibilityLabel="Verified">
        <BadgeCheck size={14} color={colors.success} strokeWidth={2.25} aria-hidden />
        <Text className="text-caption font-medium text-success">Verified</Text>
      </View>
    );
  }
  if (level === "starter") {
    return (
      <View className="rounded-pill border border-outline px-2" accessible accessibilityLabel="Starter">
        <Text className="text-caption font-medium text-text-secondary">Starter</Text>
      </View>
    );
  }
  return null;
}

/** One printer: who, how trusted, open or not, when it is ready, and what reaching it costs. */
export function PrinterCard({
  card,
  fulfilment,
  chosen,
  onChoose,
}: {
  card: api.ExpressShop;
  fulfilment: ExpressFulfilment;
  chosen: boolean;
  onChoose: () => void;
}) {
  const colors = useThemeColors();
  const home = card.printerType === "home";
  const Glyph = home ? House : Store;
  const status = printerStatus(card, fulfilment);
  const enabled = card.selectable !== false;
  const ready = enabled ? readyLine(card.readyAt) : null;
  const zone = zoneLine(card);
  const reach = reachLine(card, fulfilment);
  const price = shopPrintingPrice(card);
  const statusColor = status.tone === "success" ? "text-success" : status.tone === "info" ? "text-info" : "text-text-muted";
  const facts = [zone, reach].filter(Boolean).join(" · ");
  // A home is named by its barangay and a rounded distance, never a person or a pin.
  const homePlace = home ? [homeBarangay(card), homeDistanceLine(card.distanceMeters)].filter(Boolean).join(" · ") : null;
  const title = home ? "Home printer" : card.name;
  const label = [
    home ? printerName(card) : `${card.name}, shop`,
    card.verificationLevel === "verified" ? "Verified" : card.verificationLevel === "starter" ? "Starter" : null,
    status.label,
    ready,
    card.rating ? `rated ${card.rating.average.toFixed(1)}` : null,
    home ? homeDistanceLine(card.distanceMeters) : null,
    facts || null,
    price != null ? `printing ${api.formatPhp(price)}` : null,
  ]
    .filter(Boolean)
    .join(". ");
  return (
    <Pressable
      onPress={onChoose}
      disabled={!enabled}
      accessibilityRole="radio"
      accessibilityState={{ selected: chosen, disabled: !enabled }}
      accessibilityLabel={label}
      className={
        chosen
          ? "flex-row gap-3 rounded-card border-2 border-accent bg-surface-high p-3"
          : "flex-row gap-3 rounded-card border-2 border-outline bg-surface p-3"
      }
      style={({ pressed }) => (!enabled ? { opacity: 0.45 } : pressed ? { opacity: 0.75 } : undefined)}
    >
      <View className="h-10 w-10 items-center justify-center rounded-pill bg-surface-variant">
        <Glyph size={20} color={colors.textPrimary} strokeWidth={2} aria-hidden />
      </View>
      <View className="min-w-0 flex-1 gap-0.5">
        <View className="flex-row items-center gap-2">
          <Text className="min-w-0 shrink text-body font-bold text-text-primary" numberOfLines={1}>
            {title}
          </Text>
          <VerificationTag level={card.verificationLevel} />
        </View>
        <View className="flex-row flex-wrap items-center gap-x-2">
          <Text className={`text-caption font-medium ${statusColor}`}>{status.label}</Text>
          {ready ? <Text className="text-caption text-text-primary">{ready}</Text> : null}
          {card.rating ? (
            <View className="flex-row items-center gap-0.5">
              <Star size={11} color={colors.textSecondary} fill={colors.textSecondary} strokeWidth={2} aria-hidden />
              <Text className="text-caption text-text-secondary">{card.rating.average.toFixed(1)}</Text>
            </View>
          ) : null}
        </View>
        {homePlace ? (
          <Text className="text-caption text-text-primary" numberOfLines={1}>
            {homePlace}
          </Text>
        ) : null}
        {facts ? (
          <Text className="text-caption text-text-secondary" numberOfLines={1}>
            {facts}
          </Text>
        ) : null}
        {chosen && home && fulfilment === "pickup" ? (
          <Text className="pt-1 text-caption text-text-secondary">{HOME_PICKUP_BEFORE_PAYMENT}</Text>
        ) : null}
      </View>
      <View className="items-end justify-center">
        {price != null ? <Text className="text-body font-bold text-text-primary">{api.formatPhp(price)}</Text> : null}
        {chosen ? <Check size={20} color={colors.textPrimary} strokeWidth={2.5} aria-hidden /> : null}
      </View>
    </Pressable>
  );
}

/**
 * "Who prints it?" (gridgo-client#449, report B26328C8): after Preview and
 * before Pay. "Just print it" leads; below it, the printers that can take
 * these exact files, with each fare shown before anything is chosen.
 */
export function PrinterStep() {
  const colors = useThemeColors();
  const fulfilment = useExpress((state) => state.fulfilment);
  const place = useExpress((state) => state.place);
  const prints = useExpress((state) => state.prints);
  const shops = useExpress((state) => state.shops);
  const printers = useExpress((state) => state.printers);
  const loading = useExpress((state) => state.printersLoading);
  const error = useExpress((state) => state.shopsError);
  const printerSort = useExpress((state) => state.printerSort);
  const shopsOnly = useExpress((state) => state.shopsOnly);
  const verifiedOnly = useExpress((state) => state.verifiedOnly);
  const supplierId = useExpress((state) => state.supplierId);
  const fareLimit = useExpress((state) => state.fareLimit);
  const draft = useExpress((state) => state.draft);
  const settingsBands = usePlatformSettings((state) => state.settings?.deliveryFeeBands);
  const [placeOpen, setPlaceOpen] = useState(false);
  // "Just print it" found nobody open inside its limit, for these exact choices.
  const choices = choicesKey(expressChoices({ prints, supplierId, fulfilment, place, fareLimit, shopsOnly, verifiedOnly }));
  const noFit =
    draft.status === "error" && draft.key === choices && nothingFits({ fareLimit, draftCode: draft.code });
  const shopPrices = usesShopPrices(prints);
  const sort = validSort(printerSort, shopPrices);
  const bands = printers?.fareBands.length ? printers.fareBands : (settingsBands ?? []);
  const cards = selectableFirst(shops ?? []);
  const widened = printers ? widenedLine(printers, fulfilment) : null;
  const delivering = fulfilment === "delivery";
  const needsSavedPlace = delivering && place != null && !place.addressId;

  return (
    <View className="gap-3">
      <ChoiceChips
        label="Pick up or deliver"
        options={[
          { value: "pickup", label: "Pick up" },
          { value: "delivery", label: "Deliver" },
        ]}
        value={fulfilment}
        onChange={(next) => useExpress.getState().setFulfilment(next)}
      />
      <View className="gg-card-flush">
        <ExpressRow
          icon={delivering ? Bike : MapPin}
          title={delivering ? "Deliver to" : "Near"}
          value={place ? (needsSavedPlace ? "Choose a saved place" : place.label) : "Choose"}
          onToggle={() => setPlaceOpen(true)}
          divided={false}
        />
      </View>

      {place && !needsSavedPlace && !(error && !shops?.length) ? (
        <PrinterMap
          place={place}
          cards={cards}
          bands={bands}
          fareLimit={fareLimit}
          supplierId={supplierId}
          fulfilment={fulfilment}
          loading={loading}
          noFit={noFit}
          onChoose={(card) => useExpress.getState().chooseShop(card.supplierId, card)}
        />
      ) : null}

      <JustPrintIt bands={bands} />

      <View className="gap-2 pt-2">
        <Text className="text-h3 text-text-primary">Or pick a printer</Text>
        <Text className="text-caption text-text-secondary">
          {shopPrices ? "Each shop sets its own A3 price. You pay once it accepts." : "Printing costs the same everywhere. Only delivery changes."}
        </Text>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8 }}
        style={{ marginHorizontal: -16 }}
        contentInset={{ left: 16, right: 16 }}
        accessibilityRole="radiogroup"
        accessibilityLabel="Sort printers"
      >
        <View style={{ width: 8 }} />
        {sortOptions(shopPrices).map((option) => (
          <Pill
            key={option.value}
            role="radio"
            label={option.label}
            selected={sort === option.value}
            onPress={() => useExpress.getState().setPrinterSort(option.value)}
          />
        ))}
        <View style={{ width: 8 }} />
      </ScrollView>
      <View className="flex-row gap-2">
        <Pill role="checkbox" label="Shops only" selected={shopsOnly} onPress={() => useExpress.getState().setFilter("shopsOnly", !shopsOnly)} />
        <Pill
          role="checkbox"
          label="Verified only"
          selected={verifiedOnly}
          onPress={() => useExpress.getState().setFilter("verifiedOnly", !verifiedOnly)}
        />
      </View>

      {widened ? (
        <View className="flex-row items-start gap-2 rounded-card bg-surface-variant px-3 py-2.5" accessibilityLiveRegion="polite">
          <Info size={16} color={colors.info} strokeWidth={2} aria-hidden />
          <Text className="min-w-0 flex-1 text-caption text-text-primary">{widened}</Text>
        </View>
      ) : null}

      {!place || needsSavedPlace ? (
        <Text className="text-body text-text-secondary">
          {delivering ? "Choose a saved place to see printers and fares." : "Set where you are to see printers near you."}
        </Text>
      ) : error && !shops?.length ? (
        <ErrorState label="Printers not loaded" body={error} onRetry={() => void useExpress.getState().loadPrinters()} />
      ) : !printers && loading ? (
        <View className="gap-2" accessibilityRole="progressbar" accessibilityLabel="Finding printers">
          <SkeletonBlock className="h-20 w-full rounded-card" />
          <SkeletonBlock className="h-20 w-full rounded-card" />
          <SkeletonBlock className="h-20 w-full rounded-card" />
        </View>
      ) : printers && !cards.length ? (
        <Text className="py-4 text-center text-body text-text-secondary">
          {sort === "nearby" ? "No printer can take these files nearby. Try All Davao." : "No printer can take these files right now."}
        </Text>
      ) : (
        <View className="gap-2" style={loading ? { opacity: 0.6 } : undefined}>
          {error ? <Text className="text-caption text-error">{error}</Text> : null}
          {cards.map((card) => (
            <PrinterCard
              key={card.supplierId}
              card={card}
              fulfilment={fulfilment}
              chosen={fareLimit == null && card.supplierId === supplierId}
              onChoose={() => useExpress.getState().chooseShop(card.supplierId, card)}
            />
          ))}
        </View>
      )}

      <PlaceSheet open={placeOpen} onClose={() => setPlaceOpen(false)} />
    </View>
  );
}

/** What still stops Continue on "Who prints it?", in screen order. */
export function printerBlocker(input: {
  place: boolean;
  savedPlace: boolean;
  delivery: boolean;
  justPrintIt: boolean;
  shopPrices: boolean;
  chosen: boolean;
}): string | null {
  if (!input.place) return "Set where you are first.";
  if (input.delivery && !input.savedPlace) return "Choose a saved place to deliver to.";
  if (input.shopPrices && (input.justPrintIt || !input.chosen)) return "Pick a printer for A3.";
  if (!input.justPrintIt && !input.chosen) return "Pick a printer, or let GRIDGO pick.";
  return null;
}

export function PrinterFooter({ onContinue }: { onContinue: () => void }) {
  const place = useExpress((state) => state.place);
  const fulfilment = useExpress((state) => state.fulfilment);
  const prints = useExpress((state) => state.prints);
  const supplierId = useExpress((state) => state.supplierId);
  const fareLimit = useExpress((state) => state.fareLimit);
  const shopsOnly = useExpress((state) => state.shopsOnly);
  const verifiedOnly = useExpress((state) => state.verifiedOnly);
  const draft = useExpress((state) => state.draft);
  const key = choicesKey(expressChoices({ prints, supplierId, fulfilment, place, fareLimit, shopsOnly, verifiedOnly }));
  const current = draft.status !== "idle" && draft.key === key ? draft : null;
  const blocker = printerBlocker({
    place: place != null,
    savedPlace: Boolean(place?.addressId),
    delivery: fulfilment === "delivery",
    justPrintIt: fareLimit != null,
    shopPrices: usesShopPrices(prints),
    chosen: supplierId != null,
  });
  const failed = current?.status === "error" ? current.message : null;
  const total = current?.status === "ready" ? current.draft.quote.totalMinor : null;
  const picked = current?.status === "ready" && fareLimit != null ? printerPhrase(current.draft.shop, "a") : null;
  const disabled = Boolean(blocker) || Boolean(failed);
  return (
    <View className="gap-2 border-t border-outline-subtle bg-surface px-4 pb-2 pt-2">
      {failed || blocker ? (
        <Text className={failed ? "text-caption text-error" : "text-caption text-text-secondary"} accessibilityRole={failed ? "alert" : undefined}>
          {failed ?? blocker}
        </Text>
      ) : picked ? (
        <Text className="text-caption text-text-secondary" numberOfLines={1}>
          GRIDGO picked {picked}
        </Text>
      ) : null}
      <Pressable
        onPress={onContinue}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityState={{ disabled }}
        className={disabled ? "gg-btn-primary gg-disabled" : "gg-btn-primary"}
      >
        <Text className="text-button text-action-yellow-on">
          {total != null ? `Continue · ${api.formatPhp(total)}` : current?.status === "loading" ? "Pricing…" : "Continue"}
        </Text>
      </Pressable>
    </View>
  );
}
