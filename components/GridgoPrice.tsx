import { Text, View, type StyleProp, type TextStyle } from "react-native";

import { SkeletonLine } from "@/components/Skeleton";
import { formatPhp } from "@/lib/api";
import { clientAmountMinor } from "@/lib/gridgoPrice";
import { useServiceFeeRateBps } from "@/store/platformSettings";

type Props = {
  /** The shop's figure, as the API sent it. Null when there is no price. */
  supplierMinor: number | null | undefined;
  /** Words either side of the figure: "From " … " each". */
  prefix?: string;
  suffix?: string;
  /** The text class the figure is set in; the words share it. */
  className?: string;
  /** For a slot sized at runtime (the sample card), where a class cannot. */
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
  /** Skeleton width while the rate is unread. Match the figure it becomes. */
  waitingWidth?: string;
};

/**
 * A peso figure a client reads: the shop's price plus GRIDGO's charge.
 *
 * The same figure on every surface — the match rows, the sheet's header, the
 * commit bar, the basket — so it is one component rather than one
 * `formatPhp(clientAmountMinor(...))` per screen. While GRIDGO's rate has not
 * been read yet it draws a short skeleton line, never the shop's own number:
 * a figure that jumps up by ten percent a moment later is worse than a figure
 * that arrives late. A price that does not exist is "—", as elsewhere.
 */
export function GridgoPrice({
  supplierMinor,
  prefix = "",
  suffix = "",
  className = "text-body text-text-secondary",
  style,
  numberOfLines,
  waitingWidth = "w-16",
}: Props) {
  const rate = useServiceFeeRateBps();
  if (supplierMinor == null) {
    return (
      <Text className={className} style={style} numberOfLines={numberOfLines}>
        —
      </Text>
    );
  }
  if (rate == null) {
    return (
      <View accessible accessibilityLabel="Price loading" className="flex-row items-center">
        <SkeletonLine width={waitingWidth} height="h-5" />
      </View>
    );
  }
  return (
    <Text className={className} style={style} numberOfLines={numberOfLines}>
      {prefix}
      {formatPhp(clientAmountMinor(supplierMinor, rate))}
      {suffix}
    </Text>
  );
}

/** The same figure as words, for an accessibility label on a row. */
export function gridgoPriceLabel(
  supplierMinor: number | null | undefined,
  serviceFeeRateBps: number | null,
): string {
  if (supplierMinor == null) return "no price";
  const priced = clientAmountMinor(supplierMinor, serviceFeeRateBps);
  return priced == null ? "price loading" : formatPhp(priced);
}
