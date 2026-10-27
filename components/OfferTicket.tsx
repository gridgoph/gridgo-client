import { CalendarClock, UsersRound } from "lucide-react-native";
import { useState, type ReactNode } from "react";
import { Text, View, type LayoutChangeEvent } from "react-native";

import { Notch, NOTCH, Perforation } from "@/components/VoucherTicket";
import { useThemeColors } from "@/hooks/useTheme";
import { formatPhp } from "@/lib/api";
import { claimCopy, endDay, slotsLine, type ClaimOffer } from "@/lib/promotions";

/**
 * A launch offer not yet claimed, on the same tear-off paper as a wallet
 * voucher — so what the client redeems is visibly the ticket that lands in
 * their wallet.
 *
 * The stub is the figure. The body says what it is and the two facts that
 * decide whether to act now: when it ends and, for the Founding 30, how many
 * are left. Monochrome; the only yellow is the Redeem button beside it.
 */
export function OfferTicket({
  offer,
  /** What is behind the ticket, so the notches read as bites out of it. */
  notchColor,
}: {
  offer: ClaimOffer;
  notchColor: string;
}) {
  const colors = useThemeColors();
  const [stubWidth, setStubWidth] = useState(0);
  const copy = claimCopy(offer);
  const onStubLayout = (event: LayoutChangeEvent) => setStubWidth(event.nativeEvent.layout.width);
  const from = offer.kind === "friend_pass" && offer.founderName ? `From ${offer.founderName}` : null;

  return (
    <View
      className="overflow-hidden rounded-card border border-outline bg-surface"
      accessible
      accessibilityLabel={[
        `${copy.name}: ${formatPhp(offer.amountMinor)} off your whole order, once.`,
        from ? `${from}.` : null,
        `Ends ${endDay(offer.endsAt)}.`,
        offer.kind === "founding" ? `${slotsLine(offer.slotsLeft)}.` : null,
      ]
        .filter(Boolean)
        .join(" ")}
      testID={`offer-ticket-${offer.kind}`}
    >
      <View className="flex-row">
        <View onLayout={onStubLayout} className="min-w-28 items-center justify-center bg-surface-variant px-4 py-5">
          <Text className="text-display text-text-primary" style={{ fontVariant: ["tabular-nums"] }}>
            {copy.stub}
          </Text>
          <Text className="text-caption text-text-muted">off</Text>
        </View>

        <Perforation />

        <View className="min-w-0 flex-1 gap-2 p-4">
          <View className="gap-0.5">
            <Text className="text-body-lg font-bold text-text-primary">{copy.name}</Text>
            <Text className="text-caption text-text-secondary">{from ?? "Whole order, once"}</Text>
          </View>
          <View className="gap-1">
            <Fact icon={<CalendarClock size={14} color={colors.textMuted} strokeWidth={2} />} text={`Ends ${endDay(offer.endsAt)}`} />
            {offer.kind === "founding" ? (
              <Fact icon={<UsersRound size={14} color={colors.textMuted} strokeWidth={2} />} text={slotsLine(offer.slotsLeft)} strong />
            ) : null}
          </View>
        </View>
      </View>

      {stubWidth > 0 ? (
        <>
          <Notch left={stubWidth - NOTCH / 2} top={-NOTCH / 2} color={notchColor} />
          <Notch left={stubWidth - NOTCH / 2} bottom={-NOTCH / 2} color={notchColor} />
        </>
      ) : null}
    </View>
  );
}

function Fact({ icon, text, strong = false }: { icon: ReactNode; text: string; strong?: boolean }) {
  return (
    <View className="flex-row items-center gap-1.5">
      <View aria-hidden>{icon}</View>
      <Text className={strong ? "text-caption font-medium text-text-primary" : "text-caption text-text-secondary"}>{text}</Text>
    </View>
  );
}
