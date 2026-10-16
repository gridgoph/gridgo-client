import { CircleAlert, Info, Minus, Palette, Plus, RotateCcw } from "lucide-react-native";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";

import { SecondaryButton } from "@/components/SecondaryButton";
import { SkeletonLine } from "@/components/Skeleton";
import { useThemeColors } from "@/hooks/useTheme";
import type { CartLineRecord, ColourPage, ColourTierSet, QuantityMode } from "@/lib/api";
import { formatPhp } from "@/lib/api";
import {
  ESTIMATE_NOTE,
  PRICE_CHECK_LINE,
  QUANTITY_MODES,
  colourStatusView,
  coverageText,
  linePageCount,
  linePricedByColour,
  oneColourWarning,
  pageFileOrder,
  pageLine,
  pageName,
  pageNeedsPriceCheck,
  pageSheetPrice,
  pagesNeedingPriceCheck,
  pageUnpricedNote,
  quantityUnit,
  sheetsLine,
  tierLabel,
  tierMarks,
} from "@/lib/colourPricing";

/** Pages drawn before "Show all": a 200-page set is a list nobody scrolls. */
const PAGES_SHOWN = 8;

type Props = {
  line: CartLineRecord;
  /** GRIDGO's A3 monochrome limit, from settings; the tier label names it. */
  a3MonochromeMaxBps?: number | null;
  /** A save is in flight: the choices wait for it. */
  saving: boolean;
  onQuantityMode: (mode: QuantityMode) => void;
  onQuantity: (quantity: number) => void;
  /** Re-run a failed measure. */
  onRetry: () => void;
  retrying: boolean;
};

/**
 * Colour and price, for a document or plan priced by how much strong colour
 * each page carries (gridgo-api `docs/COLOUR_PRICING_API.md`).
 *
 * Read like a plan shop's counter slip: how the copies are counted and the
 * sheets that makes, then every page with its strong colour measured against
 * the shop's colour levels and the price that level costs, then the total.
 * Each page carries a small ruler: the strong-colour share as an ink bar,
 * with the levels' boundaries marked on it, so "18%" visibly sits in the
 * "up to 25%" band. The number and the level are always in words beside it.
 *
 * A one-colour service (blueprint, monochrome) draws the colour read and the
 * warning, and no prices: it is priced per sheet whatever the colour.
 */
export function ColourPricingSection({
  line,
  a3MonochromeMaxBps,
  saving,
  onQuantityMode,
  onQuantity,
  onRetry,
  retrying,
}: Props) {
  const pricing = line.colourPricing ?? null;
  const priced = linePricedByColour(line);
  const status = colourStatusView(pricing);
  const warning = oneColourWarning(pricing);
  const pages = pricing?.pages ?? [];
  const pending = pricing?.status === "pending";
  const mode = line.quantityMode ?? null;
  const pageCount = linePageCount(line);
  const sheets = sheetsLine(mode, line.quantity, pageCount, pricing?.totalSheets ?? line.totalSheets);
  const lineTotal = pricing?.status === "priced" ? pricing.clientLineSubtotalMinor ?? null : null;
  const checks = pagesNeedingPriceCheck(pricing);
  const tierSet = pricing?.tierSet ?? null;

  return (
    <View className="gap-4" testID="colour-pricing">
      <View className="gap-1">
        <Text accessibilityRole="header" className="text-h3 text-text-primary">
          {priced ? "Colour and price" : "Colour check"}
        </Text>
        <Text className="text-body text-text-secondary">
          {priced
            ? "This shop prices each sheet by how much strong colour is on it. Black, white, greys and light colours are the cheapest; strong colours such as orange cost more."
            : "This service prints in one colour. GRIDGO checks your file for colour so nothing you need is lost."}
        </Text>
      </View>

      {/* Copies or sets: GRIDGO needs it to price by colour, and a one-colour service collates the same way. */}
      <View className="gap-3">
        <Text className="text-body font-medium text-text-primary">How should the copies be counted?</Text>
        <View accessibilityRole="radiogroup" accessibilityLabel="How the copies are counted" className="gap-2">
          {QUANTITY_MODES.map((option) => (
            <ModeOption
              key={option.value}
              label={option.label}
              hint={option.hint}
              selected={mode === option.value}
              disabled={saving}
              onPress={() => {
                if (mode !== option.value) onQuantityMode(option.value);
              }}
            />
          ))}
        </View>
        <QuantityStepper
          mode={mode}
          quantity={line.quantity}
          disabled={saving}
          onChange={onQuantity}
        />
        {sheets ? (
          <Text accessibilityLiveRegion="polite" className="text-body-lg font-medium text-text-primary">
            {sheets}
          </Text>
        ) : null}
      </View>

      {warning ? (
        <Callout tone="warning" icon="palette" title={warning} />
      ) : null}

      {status ? (
        <Callout tone={status.tone} icon={status.tone === "error" || status.tone === "warning" ? "alert" : "info"} title={status.title} body={status.body}>
          {status.action === "retry" ? (
            <SecondaryButton
              label={retrying ? "Trying again…" : "Measure again"}
              disabled={retrying}
              onPress={onRetry}
            />
          ) : null}
        </Callout>
      ) : null}

      {pending && !pages.length ? (
        <View className="gg-card-flush" accessibilityLabel="Measuring each page" accessible>
          {Array.from({ length: Math.min(Math.max(pageCount ?? 3, 1), 4) }, (_, index) => (
            <View key={index} className={index ? "gap-2 border-t border-outline-subtle p-4" : "gap-2 p-4"}>
              <View className="flex-row justify-between">
                <SkeletonLine width="w-40" />
                <SkeletonLine width="w-16" />
              </View>
              <SkeletonLine width="w-full" height="h-1.5" />
            </View>
          ))}
        </View>
      ) : pages.length ? (
        <View className="gap-2">
          {checks.length && checks.length < pages.length ? (
            <Text className="text-caption text-warning">
              {checks.length === 1
                ? `${pageName(checks[0], pageFileOrder(pages))} needs a price check.`
                : `${checks.length} pages need a price check.`}
            </Text>
          ) : null}
          <ColourPageList
            pages={pages}
            showPrice={priced}
            unpricedNote={pageUnpricedNote(pricing)}
            tierSet={tierSet}
            a3MonochromeMaxBps={a3MonochromeMaxBps}
          />
        </View>
      ) : null}

      {priced && pages.length ? (
        <View className="gap-1 border-t border-outline-subtle pt-3">
          <View
            className="flex-row flex-wrap items-baseline justify-between gap-x-4 gap-y-1"
            accessible
            accessibilityLabel={`Printing total: ${lineTotal == null ? "not yet" : formatPhp(lineTotal)}`}
          >
            <Text className="shrink-0 text-body-lg font-medium text-text-primary">Printing total</Text>
            <Text className="shrink-0 text-h3 text-text-primary">
              {lineTotal == null ? "Not yet" : formatPhp(lineTotal)}
            </Text>
          </View>
          <Text className="text-caption text-text-muted">
            {lineTotal == null
              ? checks.length
                ? "The total appears once every page has a price."
                : "The total appears once every page is measured and priced."
              : `Every page and every ${quantityUnit(mode, 1)}. Delivery is added at checkout.`}
          </Text>
        </View>
      ) : null}

      {priced && (pages.length || pending) ? <Text className="text-caption text-text-muted">{ESTIMATE_NOTE}</Text> : null}
    </View>
  );
}

/**
 * Every measured page in a hairline list, with "Show all" past the first few.
 * Shared by the Artwork step and the order's saved record.
 */
export function ColourPageList({
  pages,
  showPrice,
  unpricedNote = "Not priced yet",
  tierSet,
  a3MonochromeMaxBps,
}: {
  pages: ColourPage[];
  showPrice: boolean;
  /** Under a page with a level but no price yet: why. */
  unpricedNote?: string;
  tierSet: ColourTierSet | null | undefined;
  a3MonochromeMaxBps?: number | null;
}) {
  const [showAll, setShowAll] = useState(false);
  const fileOrder = pageFileOrder(pages);
  const shown = showAll ? pages : pages.slice(0, PAGES_SHOWN);
  return (
    <View className="gg-card-flush">
      {shown.map((page, index) => (
        <PageRow
          key={`${page.fileId}:${page.page}`}
          page={page}
          fileOrder={fileOrder}
          first={index === 0}
          showPrice={showPrice}
          unpricedNote={unpricedNote}
          tierSet={tierSet ?? null}
          a3MonochromeMaxBps={a3MonochromeMaxBps}
        />
      ))}
      {pages.length > PAGES_SHOWN ? (
        <Pressable
          onPress={() => setShowAll((open) => !open)}
          accessibilityRole="button"
          accessibilityLabel={showAll ? "Show fewer pages" : `Show all ${pages.length} pages`}
          className="gg-touch items-center justify-center border-t border-outline-subtle px-4 py-3"
          style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
        >
          <Text className="text-button text-text-primary underline">
            {showAll ? "Show fewer pages" : `Show all ${pages.length} pages`}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** One printed page: its name, its strong colour on the ruler, its level and price. */
function PageRow({
  page,
  fileOrder,
  first,
  showPrice,
  unpricedNote,
  tierSet,
  a3MonochromeMaxBps,
}: {
  page: ColourPage;
  fileOrder: string[];
  first: boolean;
  showPrice: boolean;
  unpricedNote: string;
  tierSet: ColourTierSet | null;
  a3MonochromeMaxBps?: number | null;
}) {
  const check = showPrice && pageNeedsPriceCheck(page);
  const price = showPrice ? pageSheetPrice(page) : null;
  const level = tierLabel(page.tier, a3MonochromeMaxBps);
  return (
    <View
      className={first ? "gap-2 px-4 py-3" : "gap-2 border-t border-outline-subtle px-4 py-3"}
      accessible
      accessibilityLabel={`${pageLine(page, fileOrder, { showPrice })}${level ? `. ${level}` : ""}`}
    >
      <View className="flex-row items-baseline justify-between gap-3">
        <Text className="min-w-0 flex-1 text-body text-text-primary">
          <Text className="font-medium">{pageName(page, fileOrder)}</Text>
          {`  ${coverageText(page.strongColourBps)} strong colour`}
        </Text>
        {price != null && !check ? (
          <Text className="shrink-0 text-body-lg font-medium text-text-primary">{formatPhp(price)}</Text>
        ) : null}
      </View>
      <CoverageRuler bps={page.strongColourBps} marks={tierMarks(tierSet, a3MonochromeMaxBps)} />
      <View className="flex-row flex-wrap items-center justify-between gap-x-3 gap-y-1">
        {level ? <Text className="text-caption text-text-muted">{level}</Text> : <View />}
        {check ? (
          <View className="flex-row items-center gap-1">
            <CircleAlertIcon />
            <Text className="text-caption font-medium text-warning">{PRICE_CHECK_LINE}</Text>
          </View>
        ) : showPrice && price == null ? (
          <Text className="text-caption text-text-muted">{unpricedNote}</Text>
        ) : null}
      </View>
    </View>
  );
}

function CircleAlertIcon() {
  const colors = useThemeColors();
  return <CircleAlert size={14} color={colors.warning} strokeWidth={2} aria-hidden />;
}

/**
 * The strong-colour share as an ink bar on a 0–100% track, with each colour
 * level's boundary as a tick. A page with none draws an empty track — never a
 * sliver — and any strong colour at all draws at least a visible mark.
 */
function CoverageRuler({ bps, marks }: { bps: number; marks: number[] }) {
  const percent = Math.min(100, Math.max(0, bps / 100));
  const width = percent === 0 ? 0 : Math.max(percent, 1.5);
  return (
    <View aria-hidden className="h-1.5 w-full overflow-hidden rounded-pill bg-surface-variant">
      <View className="h-full rounded-pill bg-text-primary" style={{ width: `${width}%` }} />
      {marks.map((mark) => (
        <View
          key={mark}
          className="absolute top-0 h-full bg-text-muted"
          style={{ left: `${mark}%`, width: 1 }}
        />
      ))}
    </View>
  );
}

function ModeOption({
  label,
  hint,
  selected,
  disabled,
  onPress,
}: {
  label: string;
  hint: string;
  selected: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="radio"
      accessibilityLabel={`${label}. ${hint}`}
      accessibilityState={{ selected, disabled }}
      className={
        selected
          ? "gg-touch flex-row items-start gap-3 rounded-field border-2 border-accent bg-surface-high p-3"
          : "gg-touch flex-row items-start gap-3 rounded-field border border-outline bg-surface p-3"
      }
      style={({ pressed }) => (pressed && !disabled ? { opacity: 0.85 } : disabled ? { opacity: 0.6 } : undefined)}
    >
      <View
        className={
          selected
            ? "mt-0.5 h-5 w-5 items-center justify-center rounded-pill border-2 border-accent"
            : "mt-0.5 h-5 w-5 rounded-pill border-2 border-outline"
        }
      >
        {selected ? <View className="h-2.5 w-2.5 rounded-pill bg-accent" /> : null}
      </View>
      <View className="min-w-0 flex-1 gap-0.5">
        <Text className="text-body font-medium text-text-primary">{label}</Text>
        <Text className="text-caption text-text-secondary">{hint}</Text>
      </View>
    </Pressable>
  );
}

function QuantityStepper({
  mode,
  quantity,
  disabled,
  onChange,
}: {
  mode: QuantityMode | null;
  quantity: number;
  disabled: boolean;
  onChange: (next: number) => void;
}) {
  const colors = useThemeColors();
  const unit = mode ? quantityUnit(mode, quantity) : quantity === 1 ? "copy" : "copies";
  const step = (by: number) => {
    const next = quantity + by;
    if (next >= 1 && !disabled) onChange(next);
  };
  return (
    <View className="flex-row items-center gap-3">
      <View className="flex-row items-center rounded-field border border-outline bg-surface">
        <Pressable
          onPress={() => step(-1)}
          disabled={disabled || quantity <= 1}
          accessibilityRole="button"
          accessibilityLabel={`One fewer ${mode === "document_sets" ? "set" : "copy"}`}
          accessibilityState={{ disabled: disabled || quantity <= 1 }}
          className={disabled || quantity <= 1 ? "gg-touch gg-disabled items-center justify-center" : "gg-touch items-center justify-center"}
        >
          <Minus size={16} color={colors.textPrimary} strokeWidth={2.5} />
        </Pressable>
        <Text className="min-w-10 text-center text-body-lg font-medium text-text-primary">{quantity}</Text>
        <Pressable
          onPress={() => step(1)}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel={`One more ${mode === "document_sets" ? "set" : "copy"}`}
          accessibilityState={{ disabled }}
          className={disabled ? "gg-touch gg-disabled items-center justify-center" : "gg-touch items-center justify-center"}
        >
          <Plus size={16} color={colors.textPrimary} strokeWidth={2.5} />
        </Pressable>
      </View>
      <Text className="text-body text-text-secondary">{unit}</Text>
    </View>
  );
}

const CALLOUT_ICONS = { alert: CircleAlert, info: Info, palette: Palette, retry: RotateCcw } as const;

function Callout({
  tone,
  icon,
  title,
  body,
  children,
}: {
  tone: "muted" | "info" | "warning" | "error";
  icon: keyof typeof CALLOUT_ICONS;
  title: string;
  body?: string;
  children?: React.ReactNode;
}) {
  const colors = useThemeColors();
  const Icon = CALLOUT_ICONS[icon];
  const border =
    tone === "error" ? "border-error" : tone === "warning" ? "border-warning" : tone === "info" ? "border-info" : "border-outline";
  const ink =
    tone === "error" ? colors.error : tone === "warning" ? colors.warning : tone === "info" ? colors.info : colors.textMuted;
  return (
    <View
      className={`gap-3 rounded-field border ${border} bg-surface p-3`}
      accessibilityRole={tone === "error" || tone === "warning" ? "alert" : undefined}
    >
      <View className="flex-row items-start gap-3" accessible accessibilityLabel={body ? `${title}. ${body}` : title}>
        <View className="pt-0.5">
          <Icon size={16} color={ink} strokeWidth={2} aria-hidden />
        </View>
        <View className="min-w-0 flex-1 gap-1">
          <Text className="text-body font-medium text-text-primary">{title}</Text>
          {body ? <Text className="text-caption text-text-secondary">{body}</Text> : null}
        </View>
      </View>
      {children}
    </View>
  );
}
