import { Building2, CircleCheck, Clock, Info, TicketPercent } from "lucide-react-native";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";

import { StatusChip } from "@/components/StatusChip";
import { VoucherCodeField } from "@/components/VoucherCodeField";
import { useThemeColors } from "@/hooks/useTheme";
import { useServerNow } from "@/hooks/useVoucherClock";
import { formatPhp, type CartQuote, type Voucher } from "@/lib/api";
import {
  appliedNote,
  checkoutCandidates,
  checkoutVoucherView,
  countdownLabel,
  exactTime,
  expiryTone,
  msLeft,
  voucherAmount,
  voucherRuleLine,
  voucherTitle,
} from "@/lib/vouchers";
import { useVouchers } from "@/store/vouchers";

type Props = {
  cartId: string | null;
  quote: CartQuote | null | undefined;
  isOrganization: boolean;
  showServiceFee: boolean;
  busy: boolean;
  onApply: (voucherId: string) => void;
  onRemove: () => void;
  /** Adds a code to the wallet and applies it here; true when it went on. */
  onCode: (code: string) => Promise<boolean>;
};

/**
 * Checkout's voucher: what is on this order, and the way to change it.
 *
 * GRIDGO picks the one voucher that fits on its own, so most clients holding
 * one see it already applied with a Remove beside it and do nothing. With
 * several, GRIDGO does not choose for them; with an organization discount
 * that saves more, it keeps that one and says so. A code can still be typed
 * here, behind a quiet link — most orders have no code, and an open field on
 * every checkout reads as a step everyone must fill.
 */
export function CheckoutVoucher({ cartId, quote, isOrganization, showServiceFee, busy, onApply, onRemove, onCode }: Props) {
  const colors = useThemeColors();
  const wallet = useVouchers((state) => state.list);
  const removedCarts = useVouchers((state) => state.removedCarts);
  const notice = useVouchers((state) => state.codeNotice);
  const now = useServerNow(30_000);
  const [codeOpen, setCodeOpen] = useState(false);
  const [othersOpen, setOthersOpen] = useState(false);
  const candidates = checkoutCandidates(wallet?.vouchers ?? null, cartId, now);
  const view = checkoutVoucherView({
    quote,
    candidates,
    isOrganization,
    removed: cartId ? removedCarts.includes(cartId) : false,
  });
  const showCode = codeOpen || (view.kind === "none" && Boolean(notice));

  return (
    <View className="gap-3" testID="checkout-voucher">
      {view.kind === "applied" ? (
        <View className="gg-card-flush" testID="voucher-applied">
          <View className="flex-row items-start gap-3 p-4">
            <TicketMark live />
            <View className="min-w-0 flex-1 gap-1">
              <Text className="text-body-lg font-medium text-text-primary">{voucherTitle(view.voucher)}</Text>
              <View className="flex-row items-center gap-1.5" accessible accessibilityLabel={`Applied. ${formatPhp(view.amountMinor)} off this order`}>
                <CircleCheck size={16} color={colors.success} strokeWidth={2} aria-hidden />
                <Text className="text-body font-medium text-success">{voucherAmount(view.amountMinor)} on this order</Text>
              </View>
              <Text className="text-caption text-text-secondary">{appliedNote(view)}</Text>
            </View>
          </View>
          <View className="flex-row items-center justify-between gap-3 border-t border-outline-subtle px-4 py-1">
            <Text className="min-w-0 flex-1 text-caption text-text-muted">One voucher per order.</Text>
            <Pressable
              onPress={onRemove}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel="Remove the voucher from this order"
              accessibilityState={{ disabled: busy }}
              className={busy ? "gg-touch gg-disabled items-center justify-center px-2" : "gg-touch items-center justify-center px-2"}
              style={({ pressed }) => (pressed && !busy ? { opacity: 0.6 } : undefined)}
            >
              <Text className="text-button text-text-primary underline">Remove</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {view.kind === "organization" ? (
        <View className="gg-panel flex-row gap-3" accessible testID="voucher-organization">
          <Building2 size={18} color={colors.textPrimary} strokeWidth={2} aria-hidden />
          <View className="min-w-0 flex-1 gap-1">
            <Text className="text-body font-medium text-text-primary">Your organization discount applies</Text>
            <Text className="text-caption text-text-secondary">
              It saves as much as or more than your {formatPhp(view.candidates[0].valueMinor)} voucher on this
              order, and the two never combine. The voucher stays in your wallet for another order.
            </Text>
          </View>
        </View>
      ) : null}

      {view.kind === "waiting" ? (
        <View className="gg-panel flex-row gap-3" accessible testID="voucher-waiting">
          <Clock size={18} color={colors.textSecondary} strokeWidth={2} aria-hidden />
          <Text className="min-w-0 flex-1 text-caption text-text-secondary">
            {view.candidates.length === 1
              ? `Your ${formatPhp(view.candidates[0].valueMinor)} voucher comes off once GRIDGO has your total.`
              : "Your vouchers can be used once GRIDGO has your total."}{" "}
            Finish the steps above first.
          </Text>
        </View>
      ) : null}

      {view.kind === "choose" ? (
        <View className="gap-2" testID="voucher-choose">
          <View className="flex-row items-start gap-2">
            <Info size={16} color={colors.info} strokeWidth={2} aria-hidden />
            <Text className="min-w-0 flex-1 text-body text-text-secondary">
              {view.removed
                ? "You took the voucher off this order. Add it back if you change your mind."
                : `You have ${view.candidates.length} vouchers. Choose the one for this order — one voucher per order.`}
            </Text>
          </View>
          {view.candidates.map((voucher) => (
            <VoucherChoice key={voucher.id} voucher={voucher} now={now} busy={busy} onApply={() => onApply(voucher.id)} />
          ))}
        </View>
      ) : null}

      {/*
        Others in the wallet stay folded: the order already has its voucher,
        and a list of alternatives under it reads as more to decide.
      */}
      {view.kind === "applied" && view.others.length ? (
        othersOpen ? (
          <View className="gap-2">
            <Text className="text-caption text-text-muted">Use a different voucher instead:</Text>
            {view.others.map((voucher) => (
              <VoucherChoice key={voucher.id} voucher={voucher} now={now} busy={busy} label="Use instead" onApply={() => onApply(voucher.id)} />
            ))}
          </View>
        ) : (
          <Pressable
            onPress={() => setOthersOpen(true)}
            accessibilityRole="button"
            accessibilityState={{ expanded: false }}
            accessibilityLabel={`Use a different voucher. ${view.others.length} more in your wallet`}
            className="gg-touch flex-row items-center gap-2 self-start"
            style={({ pressed }) => (pressed ? { opacity: 0.6 } : undefined)}
          >
            <Text className="text-button text-text-primary underline">
              Use a different voucher ({view.others.length} more)
            </Text>
          </Pressable>
        )
      ) : null}

      {showCode ? (
        <VoucherCodeField onSubmit={onCode} />
      ) : (
        <Pressable
          onPress={() => setCodeOpen(true)}
          accessibilityRole="button"
          accessibilityLabel="Add a voucher code"
          className="gg-touch flex-row items-center gap-2 self-start"
          style={({ pressed }) => (pressed ? { opacity: 0.6 } : undefined)}
        >
          <TicketPercent size={16} color={colors.textPrimary} strokeWidth={2} aria-hidden />
          <Text className="text-button text-text-primary underline">
            {view.kind === "none" ? "Have a voucher code?" : "Add a code"}
          </Text>
        </Pressable>
      )}

      {notice && !showCode ? (
        <Text className={`text-caption ${notice.ok ? "text-success" : "text-error"}`} accessibilityLiveRegion="polite">
          {notice.text}
        </Text>
      ) : null}

      {view.kind !== "none" ? <Text className="text-caption text-text-muted">{voucherRuleLine(showServiceFee)}</Text> : null}
    </View>
  );
}

/** A voucher the client can put on this order. */
function VoucherChoice({
  voucher,
  now,
  busy,
  label = "Apply",
  onApply,
}: {
  voucher: Voucher;
  now: number;
  busy: boolean;
  label?: string;
  onApply: () => void;
}) {
  const remaining = msLeft(voucher.expiresAt, now);
  const tone = expiryTone(remaining);
  return (
    <View className="gg-card-flush flex-row items-center gap-3 p-3" testID={`voucher-choice-${voucher.id}`}>
      <TicketMark live />
      <View className="min-w-0 flex-1 gap-1" accessible accessibilityLabel={`${formatPhp(voucher.valueMinor)} voucher, ${voucherTitle(voucher)}. Expires ${exactTime(voucher.expiresAt)}`}>
        <Text className="text-body font-medium text-text-primary">
          {formatPhp(voucher.valueMinor)} · {voucherTitle(voucher)}
        </Text>
        <Text className="text-caption text-text-muted">Expires {exactTime(voucher.expiresAt)}</Text>
        {tone === "soon" || tone === "urgent" ? (
          <View className="flex-row">
            <StatusChip
              tone={tone === "urgent" ? "error" : "warning"}
              icon={tone === "urgent" ? "triangle-alert" : "clock"}
              label={countdownLabel(remaining)}
            />
          </View>
        ) : null}
      </View>
      <Pressable
        onPress={onApply}
        disabled={busy}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${formatPhp(voucher.valueMinor)} voucher`}
        accessibilityState={{ disabled: busy }}
        className={busy ? "gg-btn-secondary gg-disabled" : "gg-btn-secondary"}
        style={({ pressed }) => (pressed && !busy ? { opacity: 0.7 } : undefined)}
      >
        <Text className="text-button text-text-primary">{label}</Text>
      </Pressable>
    </View>
  );
}

/** The ticket's stub in miniature, so checkout's voucher reads as the one in the wallet. */
function TicketMark({ live }: { live: boolean }) {
  const colors = useThemeColors();
  return (
    <View className="h-10 w-10 items-center justify-center rounded-field bg-surface-variant" aria-hidden>
      <TicketPercent size={20} color={live ? colors.textPrimary : colors.textMuted} strokeWidth={2} />
    </View>
  );
}
