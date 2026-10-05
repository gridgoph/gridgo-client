import { Text, View, type StyleProp, type TextStyle } from "react-native";

import { SkeletonLine } from "@/components/Skeleton";
import { formatPhp } from "@/lib/api";
import { clientFigureMinor } from "@/lib/gridgoPrice";
import { useServiceFeeRateBps } from "@/store/platformSettings";

type Props = {
  /**
   * GRIDGO's figure as the API sent it (`clientFromPriceMinor`, a quote's
   * `clientLineSubtotalMinor`…). Already inside the fee: drawn as it is.
   */
  clientMinor?: number | null;
  /**
   * The shop's figure, only for a payload from before the client fields. It is
   * marked up with the live rate, and only read when `clientMinor` is absent —
   * never pass a client amount here, or the fee is added twice.
   */
  supplierMinor?: number | null;
  /** The figure is on its way (a quote in flight): a skeleton, not a guess. */
  pending?: boolean;
  /** Words either side of the figure: "From " … " each". */
  prefix?: string;
  suffix?: string;
  /** The text class the figure is set in; the words share it. */
  className?: string;
  /** For a slot sized at runtime (the sample card), where a class cannot. */
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
  /** Skeleton width while the figure is unknown. Match the figure it becomes. */
  waitingWidth?: string;
};

/**
 * A peso figure a client reads: GRIDGO's price, the fee already inside it.
 *
 * The same figure on every surface — the match rows, the sheet's header, the
 * commit bar, the basket — so it is one component rather than one
 * `formatPhp(...)` per screen. The API sends GRIDGO's figure itself
 * (gridgo-api#132), and that is what is drawn. Only an older payload, with the
 * shop's figure alone, waits on the live rate — on a short skeleton line,
 * never the shop's own number: a figure that jumps up by ten percent a moment
 * later is worse than a figure that arrives late. A price that does not exist
 * is "—", as elsewhere.
 */
export function GridgoPrice({
  clientMinor,
  supplierMinor,
  pending = false,
  prefix = "",
  suffix = "",
  className = "text-body text-text-secondary",
  style,
  numberOfLines,
  waitingWidth = "w-16",
}: Props) {
  const rate = useServiceFeeRateBps();
  const known = Number.isSafeInteger(clientMinor);
  if (pending || (!known && supplierMinor != null && rate == null)) {
    return (
      <View accessible accessibilityLabel="Price loading" className="flex-row items-center">
        <SkeletonLine width={waitingWidth} height="h-5" />
      </View>
    );
  }
  const priced = clientFigureMinor(clientMinor, supplierMinor, rate);
  if (priced == null) {
    return (
      <Text className={className} style={style} numberOfLines={numberOfLines}>
        —
      </Text>
    );
  }
  return (
    <Text className={className} style={style} numberOfLines={numberOfLines}>
      {prefix}
      {formatPhp(priced)}
      {suffix}
    </Text>
  );
}

/** The same figure as words, for an accessibility label on a row. */
export function gridgoPriceLabel(
  supplierMinor: number | null | undefined,
  serviceFeeRateBps: number | null,
  clientMinor?: number | null,
): string {
  if (!Number.isSafeInteger(clientMinor) && supplierMinor == null) return "no price";
  const priced = clientFigureMinor(clientMinor, supplierMinor, serviceFeeRateBps);
  return priced == null ? "price loading" : formatPhp(priced);
}
