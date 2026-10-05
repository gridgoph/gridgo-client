import { useState } from "react";
import { Text, View, type LayoutChangeEvent } from "react-native";
import { CircleCheck, Clock } from "lucide-react-native";
import Svg, { Line, Path } from "react-native-svg";

import { ServiceFeeRow } from "@/components/ServiceFeeRow";
import { useThemeColors } from "@/hooks/useTheme";
import { formatPhp } from "@/lib/api";
import { orderReference } from "@/lib/orderReference";
import {
  RECEIPT_BLURB,
  receiptDateLabel,
  receiptFulfilmentRow,
  receiptPaymentLine,
  receiptQuantityLabel,
  type ReceiptView,
} from "@/lib/receipt";

type Props = {
  view: ReceiptView;
  /** Draw the tap-to-explain fee row; off when the platform hides the fee. */
  showServiceFee: boolean;
};

/** Figures line up down the slip, the way a till prints them. */
const FIGURES = { fontVariant: ["tabular-nums" as const] };

/** One tooth of the torn edge, in px. */
const TOOTH_WIDTH = 12;
const TOOTH_DEPTH = 6;

/**
 * The order summary, set as a printed slip.
 *
 * Paper-white on the canvas, closed by a torn edge, with perforation rules
 * between its sections — the anatomy of a till slip, drawn from the app's own
 * tokens and type so it reads as GRIDGO's rather than a stock receipt. Every
 * figure is the order's own: its lines, printing with the fee inside it,
 * delivery, the total, where the payment stands, the reference and the date.
 *
 * It is an acknowledgement. The fine print at the foot says so, because
 * GRIDGO issues no official receipt during the pilot.
 *
 * Static on purpose: `PrintedReceipt` moves it; this only draws it.
 */
export function ReceiptSlip({ view, showServiceFee }: Props) {
  const colors = useThemeColors();
  const date = receiptDateLabel(view.issuedAt);
  const reference = orderReference(view.orderId);
  const paymentLine = receiptPaymentLine(view);
  const confirmed = view.paymentStatus === "confirmed";

  return (
    <View testID="receipt-slip">
      <View className="gap-4 border-x border-t border-outline bg-surface px-5 pb-5 pt-6">
        <View className="items-center gap-3">
          <SlipMark />
          <View className="items-center gap-1">
            <Text className="text-h3 text-text-primary">Order summary</Text>
            <Text className="text-caption text-text-muted">GRIDGO, Davao City</Text>
          </View>
        </View>

        <Perforation />

        <View className="gap-1.5">
          {reference ? <SlipRow label="Order" value={`#${reference}`} /> : null}
          {date ? <SlipRow label="Date" value={date} /> : null}
          {view.invoiceNumber ? <SlipRow label="Invoice" value={view.invoiceNumber} /> : null}
        </View>

        {view.lines.length ? (
          <>
            <Perforation />
            <View className="gap-3">
              {view.lines.map((line) => (
                <View key={line.id} className="flex-row items-start justify-between gap-4">
                  <View className="min-w-0 flex-1 gap-0.5">
                    <Text className="text-body font-medium text-text-primary">{line.name}</Text>
                    <Text className="text-caption text-text-muted" style={FIGURES}>
                      {receiptQuantityLabel(line.quantity)}
                    </Text>
                  </View>
                  <Text className="text-body text-text-primary" style={FIGURES}>
                    {line.amountLabel}
                  </Text>
                </View>
              ))}
            </View>
          </>
        ) : null}

        <Perforation />

        <View className="gap-1.5">
          <SlipRow label="Printing" value={formatPhp(view.money.printingMinor)} />
          <SlipRow {...receiptFulfilmentRow(view.money)} />
          {showServiceFee ? (
            <ServiceFeeRow explainOnly divider={false} rateBps={view.money.serviceFeeRateBps} />
          ) : null}
        </View>

        <View className="gap-2 border-t-2 border-text-primary pt-3">
          <View className="flex-row items-baseline justify-between gap-4">
            <Text className="text-body-lg font-bold text-text-primary">Total</Text>
            <Text className="text-h2 font-bold text-text-primary" style={FIGURES}>
              {formatPhp(view.money.totalMinor)}
            </Text>
          </View>
          {paymentLine ? (
            <View
              className="flex-row items-center gap-2"
              accessible
              accessibilityLabel={paymentLine}
            >
              {confirmed ? (
                <CircleCheck size={16} color={colors.success} strokeWidth={2.25} aria-hidden />
              ) : (
                <Clock size={16} color={colors.info} strokeWidth={2.25} aria-hidden />
              )}
              <Text className="shrink text-caption text-text-secondary">{paymentLine}</Text>
            </View>
          ) : null}
          {view.paymentReference ? (
            <SlipRow label="QR reference" value={view.paymentReference} />
          ) : null}
        </View>

        <Perforation />

        <Text className="text-center text-caption text-text-muted">{RECEIPT_BLURB}</Text>
      </View>
      <TornEdge />
    </View>
  );
}

/** Label left, figure right, no rule: slips are set dense. */
function SlipRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row items-baseline justify-between gap-4">
      <Text className="text-body text-text-secondary">{label}</Text>
      <Text className="shrink text-right text-body text-text-primary" style={FIGURES}>
        {value}
      </Text>
    </View>
  );
}

/**
 * The GRIDGO grid as a letterhead: nine small dots, the top-right one lit.
 * The mark's own geometry at slip scale, no wordmark — the same borrowing
 * `MatchingWait` makes, and the cell it lights is where that wait comes to rest.
 */
function SlipMark() {
  const colors = useThemeColors();
  return (
    <View className="gap-1" aria-hidden>
      {[0, 1, 2].map((row) => (
        <View key={row} className="flex-row gap-1">
          {[0, 1, 2].map((column) => (
            <View
              key={column}
              className="h-2 w-2 rounded-pill"
              style={{
                backgroundColor: row === 0 && column === 2 ? colors.brandLogo : colors.textPrimary,
              }}
            />
          ))}
        </View>
      ))}
    </View>
  );
}

/** A perforation rule between sections. */
function Perforation() {
  const colors = useThemeColors();
  return (
    <Svg height={2} width="100%" aria-hidden>
      <Line
        x1={1}
        y1={1}
        x2="100%"
        y2={1}
        stroke={colors.outline}
        strokeWidth={1.5}
        strokeDasharray="2 5"
        strokeLinecap="round"
      />
    </Svg>
  );
}

/**
 * The foot of the slip, torn off: a row of teeth in paper, outlined to meet
 * the side rules. Tooth count comes from the measured width so the teeth never
 * stretch.
 */
function TornEdge() {
  const colors = useThemeColors();
  const [width, setWidth] = useState(0);
  const onLayout = (event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width);
  const { fill, stroke } = tornEdgePaths(width);

  return (
    <View onLayout={onLayout} style={{ height: TOOTH_DEPTH + 1 }} aria-hidden>
      {width > 0 ? (
        <Svg width={width} height={TOOTH_DEPTH + 1}>
          <Path d={fill} fill={colors.surface} />
          <Path d={stroke} fill="none" stroke={colors.outline} strokeWidth={1} strokeLinejoin="round" />
        </Svg>
      ) : null}
    </View>
  );
}

/** The teeth as a filled shape and as the outline along their points. */
function tornEdgePaths(width: number): { fill: string; stroke: string } {
  if (width <= 0) return { fill: "", stroke: "" };
  const teeth = Math.max(1, Math.round(width / TOOTH_WIDTH));
  const tooth = width / teeth;
  const points: string[] = [];
  for (let i = 0; i < teeth; i += 1) {
    const left = i * tooth;
    points.push(`L${(left + tooth / 2).toFixed(2)} ${TOOTH_DEPTH}`);
    points.push(`L${Math.min(width - 0.5, left + tooth).toFixed(2)} 0`);
  }
  const teethPath = points.join(" ");
  return {
    fill: `M0 0 L0.5 0 ${teethPath} L${width} 0 Z`,
    stroke: `M0.5 0 ${teethPath}`,
  };
}
