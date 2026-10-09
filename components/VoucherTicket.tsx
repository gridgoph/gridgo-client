import { useState, type ReactNode } from "react";
import { Pressable, Text, View, type LayoutChangeEvent } from "react-native";
import Svg, { Line } from "react-native-svg";

import { StatusChip, type StatusIconName, type StatusTone } from "@/components/StatusChip";
import { useThemeColors } from "@/hooks/useTheme";
import { useServerNow } from "@/hooks/useVoucherClock";
import { formatPhp, type Voucher } from "@/lib/api";
import {
  countdownLabel,
  countdownTickMs,
  exactTime,
  expiryTone,
  msLeft,
  stubAmount,
  voucherState,
  voucherStateLine,
  voucherTitle,
  type ExpiryTone,
  type VoucherState,
} from "@/lib/vouchers";

const NOTCH = 16;

/**
 * One voucher, drawn as what it is: a tear-off ticket.
 *
 * The stub on the left carries the amount, the perforation carries the cut,
 * and the body says what it is, the exact moment it ends and how long that is
 * from now. It is the same paper language as the printed receipt, so a
 * voucher reads as something GRIDGO handed over rather than a banner.
 *
 * Monochrome on purpose. The only colour is the countdown's, and only once it
 * matters — amber under two days, red under one — always with an icon and the
 * time in words, so it reads in greyscale too. "Use now" is a plain control:
 * a wallet of three vouchers with three yellow buttons has no primary action.
 */
export function VoucherTicket({
  voucher,
  cartId = null,
  action,
}: {
  voucher: Voucher;
  /** The basket on this phone, so a voucher held for it says so. */
  cartId?: string | null;
  /** "Use now", "Apply" — whatever this voucher can do where it is shown. */
  action?: ReactNode;
}) {
  const colors = useThemeColors();
  const [stubWidth, setStubWidth] = useState(0);
  // One clock per ticket: a second hand under an hour, every 30 s otherwise.
  const [tick, setTick] = useState(30_000);
  const now = useServerNow(tick);
  const remaining = msLeft(voucher.expiresAt, now);
  const nextTick = countdownTickMs(remaining);
  if (nextTick !== tick) setTick(nextTick);

  const state = voucherState(voucher, now, cartId);
  const live = state.kind === "ready" || state.kind === "held" || state.kind === "paused";
  const stateLine = voucherStateLine(state, voucher);
  const title = voucherTitle(voucher);
  const onStubLayout = (event: LayoutChangeEvent) => setStubWidth(event.nativeEvent.layout.width);

  return (
    <View className="overflow-hidden rounded-card border border-outline bg-surface" testID={`voucher-${voucher.id}`}>
      <View className="flex-row">
        <View
          onLayout={onStubLayout}
          aria-hidden
          className={`min-w-24 items-center justify-center px-4 py-5 ${live ? "bg-surface-variant" : "bg-surface"}`}
        >
          <Text
            className={`text-h1 font-bold ${live ? "text-text-primary" : "text-text-muted"}`}
            style={{ fontVariant: ["tabular-nums"] }}
          >
            {stubAmount(voucher.valueMinor)}
          </Text>
          <Text className="text-caption text-text-muted">voucher</Text>
        </View>

        <Perforation />

        <View className="min-w-0 flex-1 gap-3 p-4">
          <View className="gap-1" accessible accessibilityLabel={ticketLabel(voucher, title, state, remaining)}>
            <Text className={`text-body-lg font-medium ${live ? "text-text-primary" : "text-text-secondary"}`}>{title}</Text>
            {live ? (
              <Text className="text-caption text-text-secondary">Expires {exactTime(voucher.expiresAt)}</Text>
            ) : null}
            <View className="mt-1 flex-row flex-wrap gap-2">
              <StateChip state={state} tone={expiryTone(remaining)} remaining={remaining} />
            </View>
            {stateLine ? <Text className="mt-1 text-caption text-text-muted">{stateLine}</Text> : null}
          </View>
          {action && live ? action : null}
        </View>
      </View>

      {/* The two half-circle bites where the stub tears off. */}
      {stubWidth > 0 ? (
        <>
          <Notch left={stubWidth - NOTCH / 2} top={-NOTCH / 2} color={colors.canvas} />
          <Notch left={stubWidth - NOTCH / 2} bottom={-NOTCH / 2} color={colors.canvas} />
        </>
      ) : null}
    </View>
  );
}

/** "₱15.00 voucher, Soft-launch tester thanks. Expires … 1 day 6 h left." — one announcement. */
function ticketLabel(voucher: Voucher, title: string, state: VoucherState, remaining: number): string {
  const head = `${formatPhp(voucher.valueMinor)} voucher, ${title}.`;
  switch (state.kind) {
    case "used":
      return `${head} Used.`;
    case "void":
      return `${head} Withdrawn by GRIDGO.`;
    case "expired":
      return `${head} Expired ${exactTime(voucher.expiresAt)}.`;
    default:
      return `${head} Expires ${exactTime(voucher.expiresAt)}. ${countdownLabel(remaining)}.${
        state.kind === "held" ? " Held for an order." : state.kind === "paused" ? " Paused by GRIDGO." : ""
      }`;
  }
}

const TONE: Record<ExpiryTone, { tone: StatusTone; icon: StatusIconName }> = {
  calm: { tone: "neutral", icon: "clock" },
  soon: { tone: "warning", icon: "clock" },
  urgent: { tone: "error", icon: "triangle-alert" },
  over: { tone: "neutral", icon: "clock" },
};

function StateChip({ state, tone, remaining }: { state: VoucherState; tone: ExpiryTone; remaining: number }) {
  switch (state.kind) {
    case "used":
      return <StatusChip tone="neutral" icon="circle-check" label="Used" />;
    case "void":
      return <StatusChip tone="neutral" icon="circle-x" label="Withdrawn" />;
    case "expired":
      return <StatusChip tone="neutral" icon="clock" label="Expired" />;
    default:
      return (
        <>
          <StatusChip tone={TONE[tone].tone} icon={TONE[tone].icon} label={countdownLabel(remaining)} />
          {state.kind === "held" ? <StatusChip tone="info" icon="clock" label="Held for an order" /> : null}
          {state.kind === "paused" ? <StatusChip tone="neutral" icon="circle-x" label="Paused" /> : null}
        </>
      );
  }
}

/** The tear line between stub and body. */
function Perforation() {
  const colors = useThemeColors();
  return (
    <View className="w-px self-stretch" aria-hidden>
      <Svg width={2} height="100%">
        <Line
          x1={1}
          y1={10}
          x2={1}
          y2="100%"
          stroke={colors.outline}
          strokeWidth={1.5}
          strokeDasharray="2 5"
          strokeLinecap="round"
        />
      </Svg>
    </View>
  );
}

function Notch({ left, top, bottom, color }: { left: number; top?: number; bottom?: number; color: string }) {
  return (
    <View
      pointerEvents="none"
      aria-hidden
      className="absolute rounded-pill border border-outline"
      style={{ left, top, bottom, width: NOTCH, height: NOTCH, backgroundColor: color }}
    />
  );
}

/** The plain control under a live ticket. Never yellow. */
export function TicketAction({
  label,
  onPress,
  disabled,
  accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  accessibilityLabel?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: Boolean(disabled) }}
      className={disabled ? "gg-btn-secondary gg-disabled self-start" : "gg-btn-secondary self-start"}
      style={({ pressed }) => (pressed && !disabled ? { opacity: 0.7 } : undefined)}
    >
      <Text className="text-button text-text-primary">{label}</Text>
    </Pressable>
  );
}
