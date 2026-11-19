import { useRouter, type Href } from "expo-router";
import { Bike, ChevronDown, MapPin, Receipt, Store, Wallet, X } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";

import { ChoiceChips, ExpressRow } from "@/components/express/ExpressChrome";
import { PayWithSheet, PlaceSheet, ShopSheet, ShopTags, shopFacts } from "@/components/express/PaySheets";
import { CheckboxRow } from "@/components/form/CheckboxRow";
import { ArtworkRightsBox } from "@/components/legal/ArtworkRightsBox";
import { QrPaySheet, paymentQrFromSettings } from "@/components/QrPaySheet";
import { VoucherCodeField } from "@/components/VoucherCodeField";
import { usePaymentProof } from "@/hooks/usePaymentProof";
import { useThemeColors } from "@/hooks/useTheme";
import * as api from "@/lib/api";
import { cashCheckoutChoice, cashErrorMessage } from "@/lib/cash";
import { userFacingError } from "@/lib/copy";
import { choicesKey, looksRightHolds } from "@/lib/express";
import { checkPaymentReference } from "@/lib/payment";
import { voucherSettlesUpFront } from "@/lib/vouchers";
import { artworkRightsPayload, useArtworkRights } from "@/store/artworkRights";
import { useExpressPayment } from "@/store/checkoutPayment";
import { expressChoices, useExpress } from "@/store/express";
import { usePlatformSettings } from "@/store/platformSettings";
import { useSession } from "@/store/session";

/** One rights tick covers whatever this Express order becomes. */
export const EXPRESS_RIGHTS_SCOPE = "express";
/** The payment draft's owner: bound once, so recreating the draft keeps the receipt. */
export const EXPRESS_PAYMENT_OWNER = "express";

function useExpressPay() {
  const prints = useExpress((state) => state.prints);
  const supplierId = useExpress((state) => state.supplierId);
  const fulfilment = useExpress((state) => state.fulfilment);
  const place = useExpress((state) => state.place);
  const draftState = useExpress((state) => state.draft);
  const tickedKey = useExpress((state) => state.tickedKey);
  const choices = expressChoices({ prints, supplierId, fulfilment, place });
  const key = choicesKey(choices);
  const draft = draftState.status === "ready" && draftState.key === key ? draftState.draft : null;
  const settings = usePlatformSettings((state) => state.settings);
  const user = useSession((state) => state.user);
  const quote = draft?.quote ?? null;
  const cash = cashCheckoutChoice(
    settings,
    user,
    quote ? ({ fulfillmentMode: fulfilment, clientQuote: quote } as unknown as api.Cart) : null,
  );
  const method = useExpressPayment((state) => state.method);
  return {
    draft,
    draftState,
    quote,
    cash,
    cashSelected: cash.eligible && method === "cash",
    noCash: voucherSettlesUpFront(quote),
    ticked: looksRightHolds(tickedKey, choices),
    settings,
  };
}

function ShopRow({ onPress }: { onPress: () => void }) {
  const colors = useThemeColors();
  const shops = useExpress((state) => state.shops);
  const supplierId = useExpress((state) => state.supplierId);
  const place = useExpress((state) => state.place);
  const shop = shops?.find((row) => row.supplierId === supplierId) ?? null;
  return (
    <Pressable
      onPress={onPress}
      disabled={!place}
      accessibilityRole="button"
      accessibilityLabel={shop ? `Shop: ${shop.name}. ${shopFacts(shop)}. Change shop` : "Choose a shop"}
      className="min-h-14 flex-row items-center gap-3 px-4 py-2.5"
      style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
    >
      <Store size={18} color={colors.textSecondary} strokeWidth={2} aria-hidden />
      <View className="min-w-0 flex-1 gap-0.5">
        {shop ? (
          <>
            <View className="flex-row items-center gap-2">
              <Text className="min-w-0 shrink text-body font-bold text-text-primary" numberOfLines={1}>
                {shop.name}
              </Text>
              <ShopTags shop={shop} />
            </View>
            <Text className="text-caption text-text-secondary" numberOfLines={1}>
              {shopFacts(shop)}
            </Text>
          </>
        ) : (
          <Text className="text-body text-text-secondary">
            {!place ? "Set where you are first" : shops && !shops.length ? "No open Express shop nearby" : "Finding shops…"}
          </Text>
        )}
      </View>
      <View style={{ transform: [{ rotate: "-90deg" }] }}>
        <ChevronDown size={18} color={colors.textMuted} strokeWidth={2} aria-hidden />
      </View>
    </Pressable>
  );
}

function MoneyLine({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <View className="flex-row items-center justify-between py-0.5">
      <Text className={strong ? "text-body font-bold text-text-primary" : "text-body text-text-secondary"}>{label}</Text>
      <Text className={strong ? "text-body font-bold text-text-primary" : "text-body text-text-primary"}>{value}</Text>
    </View>
  );
}

function Breakdown({ quote, cartId, delivery }: { quote: api.ExpressQuote; cartId: string; delivery: boolean }) {
  const colors = useThemeColors();
  const [busy, setBusy] = useState(false);
  const money = (value: number | null | undefined) => (value == null ? "—" : api.formatPhp(value));
  const voucherOff = quote.voucherDiscountMinor ?? 0;
  const orgOff = quote.organizationDiscountMinor ?? 0;

  const removeVoucher = async () => {
    setBusy(true);
    useExpress.getState().chooseVoucher(null);
    try {
      const result = await api.removeCartVoucher(cartId);
      if (result.cart.clientQuote) useExpress.getState().adoptQuote(cartId, result.cart.clientQuote);
    } catch {
      // The draft keeps its last quote; the next draft drops the voucher.
    } finally {
      setBusy(false);
    }
  };

  const applyCode = async (code: string) => {
    try {
      const { voucher } = await api.addVoucherCode(code);
      useExpress.getState().chooseVoucher(voucher.id);
      const result = await api.applyCartVoucher(cartId, { voucherId: voucher.id });
      if (result.cart.clientQuote) useExpress.getState().adoptQuote(cartId, result.cart.clientQuote);
      return true;
    } catch {
      return false;
    }
  };

  return (
    <View className="gap-1">
      <MoneyLine label="Printing" value={money(quote.clientItemSubtotalMinor)} />
      {delivery ? <MoneyLine label="Delivery" value={money(quote.deliveryFeeMinor)} /> : null}
      {orgOff > 0 ? <MoneyLine label="Organization discount" value={`−${api.formatPhp(orgOff)}`} /> : null}
      {voucherOff > 0 ? (
        <View className="flex-row items-center justify-between py-0.5">
          <Text className="min-w-0 flex-1 text-body text-text-secondary" numberOfLines={1}>
            {quote.voucher?.name ?? "Voucher"}
          </Text>
          <Text className="text-body text-success">−{api.formatPhp(voucherOff)}</Text>
          <Pressable
            onPress={() => void removeVoucher()}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel="Remove voucher"
            className="gg-touch items-center justify-center"
          >
            <X size={16} color={colors.textMuted} strokeWidth={2} aria-hidden />
          </Pressable>
        </View>
      ) : null}
      <View className="my-1 h-px bg-outline-subtle" />
      <MoneyLine label="Total" value={money(quote.totalMinor)} strong />
      {quote.downpaymentMinor != null && quote.totalMinor != null && quote.downpaymentMinor !== quote.totalMinor ? (
        <MoneyLine label="Pay now" value={api.formatPhp(quote.downpaymentMinor)} />
      ) : null}
      {voucherOff > 0 ? null : <VoucherCodeField onSubmit={applyCode} label="Voucher code" />}
    </View>
  );
}

/** Step three: where, which shop, how to pay, and the total. Sheets hold the long parts. */
export function PayStep() {
  const router = useRouter();
  const fulfilment = useExpress((state) => state.fulfilment);
  const place = useExpress((state) => state.place);
  const method = useExpressPayment((state) => state.method);
  const proofState = useExpressPayment((state) => state.proof);
  const { draft, draftState, quote, cash, noCash } = useExpressPay();
  const [sheet, setSheet] = useState<"shop" | "place" | "pay" | "qr" | null>(null);
  const [totalOpen, setTotalOpen] = useState(false);
  const proof = usePaymentProof(EXPRESS_PAYMENT_OWNER, useExpressPayment);
  useEffect(() => {
    useExpressPayment.getState().bind(EXPRESS_PAYMENT_OWNER);
  }, []);
  const settings = usePlatformSettings((state) => state.settings);

  const payValue = noCash
    ? "Voucher covers it"
    : method === "cash" && cash.eligible
      ? "Cash on delivery"
      : proofState.phase === "stored"
        ? "QR Ph · receipt added"
        : "QR Ph · add receipt";
  const totalValue = quote?.totalMinor != null
    ? api.formatPhp(quote.totalMinor)
    : draftState.status === "error"
      ? "Not priced"
      : "…";

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
        <ShopRow onPress={() => setSheet("shop")} />
        <ExpressRow
          icon={fulfilment === "delivery" ? Bike : MapPin}
          title={fulfilment === "delivery" ? "Deliver to" : "Near"}
          value={place ? (fulfilment === "delivery" && !place.addressId ? "Choose a saved place" : place.label) : "Choose"}
          onToggle={() => setSheet("place")}
        />
        <ExpressRow icon={Wallet} title="Pay with" value={payValue} onToggle={() => setSheet("pay")} />
        <ExpressRow
          icon={Receipt}
          title="Total"
          value={totalValue}
          open={totalOpen}
          onToggle={() => setTotalOpen((open) => !open)}
        >
          {draft && quote ? (
            <Breakdown quote={quote} cartId={draft.cartId} delivery={fulfilment === "delivery"} />
          ) : (
            <Text className="text-caption text-text-muted">
              {draftState.status === "error" ? draftState.message : "Pricing…"}
            </Text>
          )}
        </ExpressRow>
      </View>
      {draftState.status === "error" && !totalOpen ? (
        <Text className="text-caption text-error" accessibilityRole="alert">
          {draftState.message}
        </Text>
      ) : null}
      <ArtworkRightsBox scope={EXPRESS_RIGHTS_SCOPE} onOpen={(href: Href) => router.push(href)} />

      <ShopSheet open={sheet === "shop"} onClose={() => setSheet(null)} />
      <PlaceSheet open={sheet === "place"} onClose={() => setSheet(null)} />
      <PayWithSheet
        open={sheet === "pay"}
        onClose={() => setSheet(null)}
        onShowQr={() => setSheet("qr")}
        proof={proof}
        cash={cash}
        amountMinor={quote?.downpaymentMinor ?? null}
      />
      <QrPaySheet
        open={sheet === "qr"}
        onClose={() => setSheet("pay")}
        downpaymentMinor={quote?.downpaymentMinor ?? 0}
        downpaymentPercent={100}
        imageUrl={paymentQrFromSettings(settings)?.imageUrl}
      />
    </View>
  );
}

/** What still stops Place order, in the order the client meets it on screen. */
function blockerLine(input: {
  draft: boolean;
  ticked: boolean;
  delivery: boolean;
  addressOk: boolean;
  paid: boolean;
  rights: boolean;
}): string | null {
  if (input.delivery && !input.addressOk) return "Choose a saved place to deliver to.";
  if (!input.draft) return "Waiting for the price.";
  if (!input.ticked) return "Tick Looks right.";
  if (!input.paid) return "Add your payment receipt and reference.";
  if (!input.rights) return "Tick that you may print these files.";
  return null;
}

export function PayFooter() {
  const router = useRouter();
  const { draft, quote, cashSelected, noCash, ticked } = useExpressPay();
  const fulfilment = useExpress((state) => state.fulfilment);
  const place = useExpress((state) => state.place);
  const proof = useExpressPayment((state) => state.proof);
  const reference = useExpressPayment((state) => state.reference);
  const rights = useArtworkRights((state) => state.agreed[EXPRESS_RIGHTS_SCOPE] === true);
  const [busy, setBusy] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const paid = noCash || cashSelected || (proof.phase === "stored" && Boolean(proof.fileId) && checkPaymentReference(reference).ok);
  const blocker = blockerLine({
    draft: Boolean(draft),
    ticked,
    delivery: fulfilment === "delivery",
    addressOk: Boolean(place?.addressId),
    paid,
    rights,
  });

  const placeOrder = async () => {
    setAttempted(true);
    if (blocker || !draft || busy) return;
    setBusy(true);
    setError(null);
    try {
      const artworkRights = await artworkRightsPayload();
      const payment = noCash
        ? null
        : cashSelected
          ? ({ method: "cash" } as const)
          : { reference: reference.trim(), proofFileId: proof.fileId as string };
      const { order } = await api.checkoutExpress(draft.cartId, {
        confirmation: draft.confirmation,
        payment,
        artworkRights,
      });
      useExpressPayment.getState().reset();
      useArtworkRights.getState().setAgreed(EXPRESS_RIGHTS_SCOPE, false);
      // Lift the back guard first; the replace runs once that render landed.
      useExpress.getState().leave();
      requestAnimationFrame(() => router.replace({ pathname: "/express/order/[id]", params: { id: order.id } }));
    } catch (failure) {
      const code = (failure as { code?: string } | null)?.code ?? null;
      if (code === "express_preview_required") {
        useExpress.getState().setTicked(false);
        void useExpress.getState().refreshDraft();
        setError("Something changed. Check the preview and tick Looks right again.");
      } else if (code === "express_shop_unavailable") {
        void useExpress.getState().loadShops();
        setError("That shop just closed. Choose another shop.");
      } else if (code && code.startsWith("cash_")) {
        useExpressPayment.getState().chooseMethod("qr_manual");
        setError(cashErrorMessage(code));
      } else {
        setError(userFacingError(failure, "Your order was not placed. Try again."));
      }
    } finally {
      setBusy(false);
    }
  };

  const amount = quote?.totalMinor != null ? ` · ${api.formatPhp(quote.totalMinor)}` : "";
  const message = error ?? (attempted ? blocker : null);
  return (
    <View className="gap-2 border-t border-outline-subtle bg-surface px-4 pb-2 pt-2">
      {!ticked ? (
        <CheckboxRow
          checked={false}
          onChange={(next) => useExpress.getState().setTicked(next)}
          label="Looks right"
          hint="Your files print as set on Preview"
        />
      ) : null}
      {message ? (
        <Text className="text-caption text-error" accessibilityRole="alert">
          {message}
        </Text>
      ) : null}
      <Pressable
        onPress={() => void placeOrder()}
        disabled={busy}
        accessibilityRole="button"
        accessibilityState={{ disabled: busy || Boolean(blocker) }}
        className={blocker || busy ? "gg-btn-primary gg-disabled" : "gg-btn-primary"}
      >
        <Text className="text-button text-action-yellow-on">{busy ? "Placing order…" : `Place order${amount}`}</Text>
      </Pressable>
    </View>
  );
}
