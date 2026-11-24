import { ChevronDown, ChevronUp, Map as MapIcon, MapPinned } from "lucide-react-native";
import { useState } from "react";
import { Text, useWindowDimensions, View } from "react-native";

import { PrinterMapFrame } from "@/components/express/PrinterMapFrame";
import { Pressable } from "@/components/Pressable";
import { useThemeColors, useThemeName } from "@/hooks/useTheme";
import type { DeliveryFeeBand, ExpressFareLimit, ExpressShop } from "@/lib/api";
import type { ExpressFulfilment } from "@/lib/express";
import { printerName } from "@/lib/homePrinter";
import { printerMapModel } from "@/lib/mapHtml";
import {
  MAP_OPEN_MIN_WINDOW_HEIGHT,
  fareReach,
  homesOffMapLine,
  isOpenPrinter,
  mapCountLine,
  noFitLine,
  printerPins,
  unavailableLine,
} from "@/lib/printerMap";
import type { ExpressPlace } from "@/store/express";

/** Tall enough to compare a few pins, short enough that a printer card shows under it. */
const MAP_HEIGHT = 196;

/** A legend swatch: the pin's own shape in miniature, always beside its word. */
function Swatch({ kind }: { kind: "open" | "closed" | "reach" }) {
  if (kind === "reach") return <View className="h-3.5 w-3.5 rounded-pill border border-dashed border-text-secondary" />;
  return kind === "open" ? (
    <View className="h-3.5 w-3.5 rounded-pill border-2 border-surface bg-accent" />
  ) : (
    <View className="h-3.5 w-3.5 rounded-pill border border-dashed border-text-muted bg-surface" />
  );
}

/**
 * The map on Express "Who prints it?" (gridgo-client#468, report C49D5A3E):
 * the client's place, the printers the list already shows, and how far the
 * fare limit reaches. A tap on a pin picks that printer, exactly as its card
 * in the list does; the list stays the whole choice for anyone who prefers it.
 * When nothing open fits the limit, the map opens on the nearest open ones.
 */
export function PrinterMap({
  place,
  cards,
  bands,
  fareLimit,
  supplierId,
  fulfilment,
  loading,
  noFit,
  onChoose,
}: {
  place: ExpressPlace;
  cards: ExpressShop[];
  bands: DeliveryFeeBand[];
  fareLimit: ExpressFareLimit | null;
  supplierId: string | null;
  fulfilment: ExpressFulfilment;
  loading: boolean;
  noFit: boolean;
  onChoose: (card: ExpressShop) => void;
}) {
  const colors = useThemeColors();
  const theme = useThemeName() === "dark" ? "dark" : "light";
  const { height: windowHeight } = useWindowDimensions();
  // Null until the client folds or opens it; the default follows the phone and the no-fit state.
  const [userOpen, setUserOpen] = useState<boolean | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [wasNoFit, setWasNoFit] = useState(noFit);
  if (wasNoFit !== noFit) {
    // Nothing fits: open the map again even if it was folded, so the distances are in view.
    setWasNoFit(noFit);
    if (noFit) setUserOpen(null);
  }
  const open = userOpen ?? (noFit || windowHeight >= MAP_OPEN_MIN_WINDOW_HEIGHT);

  const reach = fareReach(bands, fareLimit, fulfilment);
  const { pins, frame } = printerPins(cards, { supplierId, fareLimit, noFit });
  const model = printerMapModel({ theme, place, printers: pins, frame, reach, routeColor: colors.actionYellow });

  const choose = (id: string) => {
    const card = cards.find((row) => row.supplierId === id);
    if (!card) return;
    if (!isOpenPrinter(card)) {
      setNotice(unavailableLine(card, fulfilment));
      return;
    }
    setNotice(`Picked ${printerName(card) ?? card.name}. It's marked in the list below.`);
    onChoose(card);
  };

  const count = loading && !cards.length ? "Finding printers…" : mapCountLine(cards);
  const homes = homesOffMapLine(cards);

  return (
    <View className="gg-card-flush overflow-hidden">
      <Pressable
        onPress={() => setUserOpen(!open)}
        accessibilityRole="button"
        accessibilityLabel={`Printers on the map: ${count}`}
        accessibilityState={{ expanded: open }}
        accessibilityHint={open ? "Hides the map" : "Shows the map"}
        className="min-h-12 flex-row items-center gap-3 px-4 py-2.5"
        style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
      >
        <MapIcon size={18} color={colors.textSecondary} strokeWidth={2} aria-hidden />
        <Text className="text-body font-medium text-text-primary">Map</Text>
        <Text className="min-w-0 flex-1 text-right text-body text-text-secondary" numberOfLines={1}>
          {count}
        </Text>
        {open ? (
          <ChevronUp size={18} color={colors.textMuted} strokeWidth={2} aria-hidden />
        ) : (
          <ChevronDown size={18} color={colors.textMuted} strokeWidth={2} aria-hidden />
        )}
      </Pressable>

      {open ? (
        <View className="border-t border-outline-subtle">
          {noFit ? (
            <View className="flex-row items-start gap-2 bg-surface-variant px-4 py-2.5" accessibilityLiveRegion="polite">
              <MapPinned size={16} color={colors.textPrimary} strokeWidth={2} aria-hidden />
              <Text className="min-w-0 flex-1 text-caption text-text-primary">{noFitLine(cards)}</Text>
            </View>
          ) : null}
          <PrinterMapFrame model={model} height={MAP_HEIGHT} onPrinter={choose} />
          <View className="gap-1.5 px-4 py-2.5">
            <View className="flex-row flex-wrap items-center gap-x-4 gap-y-1">
              <View className="flex-row items-center gap-1.5">
                <Swatch kind="open" />
                <Text className="text-caption text-text-secondary">Open</Text>
              </View>
              <View className="flex-row items-center gap-1.5">
                <Swatch kind="closed" />
                <Text className="text-caption text-text-secondary">Closed or busy</Text>
              </View>
              {reach ? (
                <View className="flex-row items-center gap-1.5">
                  <Swatch kind="reach" />
                  <Text className="text-caption text-text-secondary">{reach.label}</Text>
                </View>
              ) : null}
            </View>
            {notice ? (
              <Text className="text-caption font-medium text-text-primary" accessibilityLiveRegion="polite">
                {notice}
              </Text>
            ) : (
              <Text className="text-caption text-text-muted">Tap a pin to pick that printer.</Text>
            )}
            {homes ? <Text className="text-caption text-text-muted">{homes}</Text> : null}
          </View>
        </View>
      ) : null}
    </View>
  );
}
