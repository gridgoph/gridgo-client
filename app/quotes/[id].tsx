import { Check } from "lucide-react-native";
import { useCallback, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter, type Href } from "expo-router";

import { ConfirmDialog } from "@/components/ConfirmDialog";
import { ErrorScreenState } from "@/components/ErrorState";
import { PrimaryButton } from "@/components/PrimaryButton";
import { Screen } from "@/components/Screen";
import { SecondaryButton } from "@/components/SecondaryButton";
import { SkeletonBlock } from "@/components/Skeleton";
import { SpecRow } from "@/components/SpecRow";
import { StatusChip } from "@/components/StatusChip";
import { ZoneRatingLine } from "@/components/ZoneRatingLine";
import { useLiveRefresh } from "@/hooks/useLiveRefresh";
import { useThemeColors } from "@/hooks/useTheme";
import { formatPhp, type QuoteRequest } from "@/lib/api";
import { GRIDGO_OFFICE_LABEL } from "@/lib/gridgoOffice";
import {
  canAcceptQuote,
  canCancelQuote,
  newQuoteHref,
  quoteOptionsView,
  quoteProductName,
  quoteStatusOf,
  quoteStatusView,
  validityLine,
  type QuoteOptionView,
} from "@/lib/quoteRequests";
import { cartIsOpen, cartLineCount, useCart } from "@/store/cart";
import { useQuotes } from "@/store/quotes";

/**
 * One quote request: where it stands, the options once GRIDGO publishes them,
 * and the brief as sent (gridgo-api#226).
 *
 * The options are A, B and C with one all-in price each, never a shop. The
 * option GRIDGO ranked first for the client's priorities carries the usual
 * matching badge. Accepting opens the option as its own basket and goes
 * straight to the ordinary checkout.
 */
export default function QuoteScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const quote = useQuotes((state) => (id ? state.byId[id] : undefined));
  const readError = useQuotes((state) => (id ? state.readError[id] : null));
  const busy = useQuotes((state) => state.busy);
  const actionError = useQuotes((state) => state.actionError);
  const [picked, setPicked] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<"basket" | "cancel" | null>(null);
  // Validity is read against the clock as of this visit, re-read on focus.
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(() => (id ? useQuotes.getState().load(id) : undefined), [id]);
  useLiveRefresh(["notifications"], load, { refreshOnFocus: false });
  useFocusEffect(
    useCallback(() => {
      useQuotes.getState().clearActionError();
      setNow(Date.now());
      void load();
    }, [load]),
  );

  if (!quote) {
    if (readError) {
      return (
        <Screen edges={["bottom"]}>
          <ErrorScreenState label="Quote not loaded" body={readError} onRetry={() => void load()} />
        </Screen>
      );
    }
    return (
      <Screen edges={["bottom"]}>
        <View className="gg-page gap-3 pt-4" accessibilityLabel="Loading your quote">
          <SkeletonBlock className="h-24 w-full rounded-card" />
          <SkeletonBlock className="h-48 w-full rounded-card" />
        </View>
      </Screen>
    );
  }

  const status = quoteStatusOf(quote, now);
  const view = quoteStatusView(quote, now);
  const options = quoteOptionsView(quote);
  const acceptable = canAcceptQuote(quote, now);
  const chosen = acceptable ? (picked ?? options[0]?.label ?? null) : quote.acceptedOption ?? null;
  const validity = validityLine(quote, now);

  // The phone keeps one basket. A quote opens as its own, so a basket already
  // holding other things is asked about before it is set aside.
  const basketInTheWay = (cartId: string | null | undefined) => {
    const cart = useCart.getState();
    return cartIsOpen(cart) && cart.cartId !== cartId;
  };

  const accept = async () => {
    if (!chosen || !id) return;
    setConfirming(null);
    const cart = await useQuotes.getState().accept(id, chosen);
    if (!cart) return;
    useCart.getState().adopt(cart);
    router.push("/checkout");
  };

  const continueToCheckout = async () => {
    if (!id) return;
    setConfirming(null);
    const cart = await useQuotes.getState().openCart(id);
    if (!cart) return;
    useCart.getState().adopt(cart);
    router.push("/checkout");
  };

  const onPrimary = () => {
    if (status === "published") {
      if (basketInTheWay(null)) setConfirming("basket");
      else void accept();
    } else if (status === "accepted") {
      if (basketInTheWay(quote.cartId)) setConfirming("basket");
      else void continueToCheckout();
    }
  };

  const primaryLabel =
    status === "published"
      ? busy === "accept"
        ? "Accepting…"
        : `Accept option ${chosen ?? ""}`.trim()
      : status === "accepted"
        ? busy === "open"
          ? "Opening…"
          : "Continue to checkout"
        : null;

  return (
    <Screen edges={["bottom"]}>
      <ScrollView className="gg-screen" contentContainerClassName="gg-page gap-6 pb-10 pt-2">
        <View className="gap-2">
          <Text className="text-overline text-text-muted">QUOTE REQUEST</Text>
          <Text className="text-h1 text-text-primary">{quoteProductName(quote)}</Text>
          <View className="flex-row">
            <StatusChip tone={view.tone} label={view.label} icon={view.icon} />
          </View>
          <Text className="text-body text-text-secondary">{view.line}</Text>
          {validity ? <Text className="text-caption text-text-muted">{validity}</Text> : null}
        </View>

        {options.length ? (
          <View className="gap-3" accessibilityRole={acceptable ? "radiogroup" : undefined}>
            <Text className="text-overline text-text-muted">YOUR OPTIONS</Text>
            {options.map((option) => (
              <OptionCard
                key={option.label}
                option={option}
                quantity={quote.quantity}
                selectable={acceptable}
                selected={chosen === option.label}
                accepted={!acceptable && quote.acceptedOption === option.label}
                onPress={() => setPicked(option.label)}
              />
            ))}
            <Text className="text-caption text-text-muted">
              Each price includes printing and GRIDGO&apos;s service. Delivery is added at checkout.
            </Text>
          </View>
        ) : null}

        {primaryLabel ? (
          <View className="gap-2">
            <PrimaryButton label={primaryLabel} onPress={onPrimary} disabled={busy != null || !chosen} />
          </View>
        ) : null}
        {status === "ordered" && quote.orderId ? (
          <SecondaryButton label="View order" onPress={() => router.push(`/order/${quote.orderId}`)} />
        ) : null}
        {status === "expired" || status === "cancelled" ? (
          <SecondaryButton
            label="Request a new quote"
            onPress={() => router.push(newQuoteHref(quote.productType) as Href)}
          />
        ) : null}
        {actionError ? (
          <Text className="text-body text-error" accessibilityLiveRegion="polite">
            {actionError}
          </Text>
        ) : null}

        <BriefCard quote={quote} />

        {canCancelQuote(quote, now) ? (
          <Pressable
            onPress={() => setConfirming("cancel")}
            accessibilityRole="button"
            className="gg-touch items-center justify-center"
            style={({ pressed }) => (pressed ? { opacity: 0.6 } : undefined)}
          >
            <Text className="text-button text-text-secondary">Cancel this quote request</Text>
          </Pressable>
        ) : null}
      </ScrollView>

      <ConfirmDialog
        visible={confirming === "basket"}
        question="Set your basket aside?"
        body={basketLine(cartLineCount(useCart.getState()))}
        confirmLabel={status === "accepted" ? "Continue to checkout" : `Accept option ${chosen ?? ""}`.trim()}
        cancelLabel="Keep my basket"
        busy={busy != null}
        onConfirm={() => void (status === "accepted" ? continueToCheckout() : accept())}
        onCancel={() => setConfirming(null)}
      />
      <ConfirmDialog
        visible={confirming === "cancel"}
        question="Cancel this quote request?"
        body="GRIDGO stops gathering prices and any options you have stop being offered. You can request a new quote later."
        confirmLabel="Cancel quote"
        cancelLabel="Keep it"
        tone="destructive"
        busy={busy === "cancel"}
        onConfirm={() => {
          if (!id) return;
          void useQuotes.getState().cancel(id).then(() => setConfirming(null));
        }}
        onCancel={() => setConfirming(null)}
      />
    </Screen>
  );
}

function OptionCard({
  option,
  quantity,
  selectable,
  selected,
  accepted,
  onPress,
}: {
  option: QuoteOptionView;
  quantity: number;
  selectable: boolean;
  selected: boolean;
  accepted: boolean;
  onPress: () => void;
}) {
  const colors = useThemeColors();
  const ringed = (selectable && selected) || accepted;
  const label = [
    option.title,
    option.badge,
    `${option.price} all in for ${quantity}`,
    option.production,
    option.readyBy ? `ready by ${option.readyBy}` : null,
    option.fit?.text,
    option.recommended ? `Recommended: ${option.recommended}` : null,
    accepted ? "Your choice" : null,
  ]
    .filter(Boolean)
    .join(", ");

  const body = (
    <>
      <View className="flex-row flex-wrap items-baseline gap-x-2 gap-y-1">
        <Text className="text-h3 text-text-primary">{option.title}</Text>
        {option.badge ? <Text className="text-overline font-bold text-brand">{option.badge}</Text> : null}
        {accepted ? <Text className="text-overline font-bold text-text-primary">YOUR CHOICE</Text> : null}
      </View>
      <View className="mt-2 flex-row items-start gap-3">
        <View className="min-w-0 flex-1 gap-0.5">
          <Text className="text-h2 text-text-primary">{option.price}</Text>
          <Text className="text-caption text-text-muted">All in, for {quantity.toLocaleString("en-PH")}</Text>
        </View>
        <ZoneRatingLine zone={option.zone} rating={option.rating} layout="stacked" />
      </View>
      <View className="mt-3 gap-1 border-t border-outline pt-3">
        {option.production ? <Text className="text-body text-text-secondary">{option.production}</Text> : null}
        <Text className="text-body text-text-primary">
          {option.readyBy ? `Ready by ${option.readyBy}` : "GRIDGO confirms the ready date"}
        </Text>
        {option.fit ? (
          <View className="mt-1 flex-row">
            <StatusChip tone={option.fit.tone} label={option.fit.text} icon={option.fit.icon} />
          </View>
        ) : null}
        {option.recommended ? (
          <Text className="mt-1 text-caption text-text-secondary">Shop&apos;s advice: {option.recommended}</Text>
        ) : null}
      </View>
    </>
  );

  const className = ringed
    ? "gg-card-flush flex-row gap-3 border-2 border-accent p-4"
    : "gg-card-flush flex-row gap-3 border-2 border-transparent p-4";

  if (!selectable) {
    return (
      <View className={className} accessible accessibilityLabel={label}>
        <View className="min-w-0 flex-1">{body}</View>
      </View>
    );
  }
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected, checked: selected }}
      accessibilityLabel={label}
      className={className}
      style={({ pressed }) => (pressed ? { opacity: 0.85 } : undefined)}
    >
      <View className="min-w-0 flex-1">{body}</View>
      <View
        className={
          selected
            ? "mt-1 h-6 w-6 items-center justify-center rounded-pill bg-accent"
            : "mt-1 h-6 w-6 rounded-pill border-2 border-outline"
        }
        aria-hidden
      >
        {selected ? <Check size={14} color={colors.accentOn} strokeWidth={3} /> : null}
      </View>
    </Pressable>
  );
}

function BriefCard({ quote }: { quote: QuoteRequest }) {
  const fulfilment = quote.requestFulfillment;
  const files = (quote.referenceFiles ?? []).map((file) => file.originalFilename || "Your file").join(", ");
  return (
    <View className="gap-1">
      <Text className="text-overline text-text-muted">WHAT YOU SENT</Text>
      <View className="gg-card-flush px-4">
        <SpecRow label="For" value={quote.use} />
        <SpecRow label="Placement" value={quote.placement === "outdoor" ? "Outdoor" : "Indoor"} />
        <SpecRow label="Size" value={quote.size} />
        <SpecRow label="Quantity" value={quote.quantity.toLocaleString("en-PH")} />
        {files ? <SpecRow label="File" value={files} /> : null}
        {quote.notes ? <SpecRow label="Notes" value={quote.notes} /> : null}
        {quote.budgetMinor != null ? <SpecRow label="Budget" value={formatPhp(quote.budgetMinor)} /> : null}
        {quote.eventDate ? <SpecRow label="Event date" value={eventDateLabel(quote.eventDate)} /> : null}
        {fulfilment ? (
          <SpecRow
            label={fulfilment.fulfillmentMode === "pickup" ? "Pick up" : "Deliver to"}
            value={
              fulfilment.fulfillmentMode === "pickup"
                ? GRIDGO_OFFICE_LABEL
                : fulfilment.dropoff?.label || "Your pin"
            }
          />
        ) : null}
      </View>
    </View>
  );
}

function basketLine(count: number): string {
  const items = count === 1 ? "1 item" : `${count} items`;
  return `Your basket has ${items}. This quote opens as its own order, so the basket on this phone is replaced.`;
}

function eventDateLabel(day: string): string {
  return new Date(`${day}T12:00:00+08:00`).toLocaleDateString("en-PH", {
    timeZone: "Asia/Manila",
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
