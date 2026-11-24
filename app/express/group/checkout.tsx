import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import { Check, Receipt, Store, Users, Wallet, X } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";

import { ExpressRow } from "@/components/express/ExpressChrome";
import { MemberRow } from "@/components/express/GroupCards";
import { PayWithSheet, shopFacts } from "@/components/express/PaySheets";
import { CheckboxRow } from "@/components/form/CheckboxRow";
import { FormScreen } from "@/components/FormScreen";
import { ArtworkRightsBox } from "@/components/legal/ArtworkRightsBox";
import { QrPaySheet, paymentQrFromSettings } from "@/components/QrPaySheet";
import { SkeletonBlock } from "@/components/Skeleton";
import { VoucherCodeField } from "@/components/VoucherCodeField";
import { usePaymentProof } from "@/hooks/usePaymentProof";
import { useThemeColors } from "@/hooks/useTheme";
import { useServerNow } from "@/hooks/useVoucherClock";
import * as api from "@/lib/api";
import { cashCheckoutChoice, cashErrorMessage } from "@/lib/cash";
import { distanceLabel } from "@/lib/express";
import { firstName, pagesLine, timeLeft } from "@/lib/expressGroup";
import { checkPaymentReference } from "@/lib/payment";
import { voucherSettlesUpFront } from "@/lib/vouchers";
import { apiErrorCode } from "@/lib/whoPrints";
import { artworkRightsPayload, useArtworkRights } from "@/store/artworkRights";
import { useExpressPayment } from "@/store/checkoutPayment";
import { groupError, useExpressGroup } from "@/store/expressGroup";
import { useGroupCheckout } from "@/store/groupCheckout";
import { usePlatformSettings } from "@/store/platformSettings";
import { useSession } from "@/store/session";

/** One rights tick covers whatever the group order becomes. */
const GROUP_RIGHTS_SCOPE = "express-group";

function MoneyLine({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <View className="flex-row items-center justify-between py-0.5">
      <Text className={strong ? "text-body font-bold text-text-primary" : "text-body text-text-secondary"}>{label}</Text>
      <Text className={strong ? "text-body font-bold text-text-primary" : "text-body text-text-primary"}>{value}</Text>
    </View>
  );
}

/** Pickup: the host picks the shop everyone's prints wait at. */
function ShopChoice() {
  const colors = useThemeColors();
  const shops = useGroupCheckout((state) => state.shops);
  const shopsError = useGroupCheckout((state) => state.shopsError);
  const supplierId = useGroupCheckout((state) => state.supplierId);
  const preparing = useGroupCheckout((state) => state.preparing);
  if (shopsError) return <Text className="text-caption text-error">{shopsError}</Text>;
  if (!shops) return <SkeletonBlock className="h-28" />;
  if (!shops.length) return <Text className="text-body text-text-secondary">No Express shop is open near you right now.</Text>;
  return (
    <View className="gap-2" accessibilityRole="radiogroup" accessibilityLabel="Pick up from">
      {shops.slice(0, 6).map((shop) => {
        const chosen = shop.supplierId === supplierId;
        return (
          <Pressable
            key={shop.supplierId}
            onPress={() => void useGroupCheckout.getState().chooseShop(shop.supplierId)}
            disabled={preparing}
            accessibilityRole="radio"
            accessibilityState={{ selected: chosen, disabled: preparing }}
            className={chosen ? "min-h-14 flex-row items-center gap-3 rounded-card border-2 border-accent bg-surface px-3 py-2" : "min-h-14 flex-row items-center gap-3 rounded-card border border-outline bg-surface px-3 py-2"}
          >
            <Store size={20} color={colors.textSecondary} strokeWidth={2} aria-hidden />
            <View className="min-w-0 flex-1">
              <Text className="text-body font-bold text-text-primary" numberOfLines={1}>
                {shop.name}
              </Text>
              <Text className="text-caption text-text-secondary" numberOfLines={1}>
                {shopFacts(shop)}
              </Text>
            </View>
            {chosen ? <Check size={18} color={colors.textPrimary} strokeWidth={2.5} aria-hidden /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * The host's one checkout for the whole group (gridgo-client#452): everyone's
 * prints by person, the delivery fee once, the total, and today's Express
 * payment. Members pay the host back outside the app.
 */
export default function GroupCheckoutScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const group = useExpressGroup((state) => (id ? state.byId[id] : undefined));
  const prepared = useGroupCheckout((state) => state.prepared);
  const preparing = useGroupCheckout((state) => state.preparing);
  const prepareError = useGroupCheckout((state) => state.error);
  const method = useExpressPayment((state) => state.method);
  const proofState = useExpressPayment((state) => state.proof);
  const reference = useExpressPayment((state) => state.reference);
  const rights = useArtworkRights((state) => state.agreed[GROUP_RIGHTS_SCOPE] === true);
  const settings = usePlatformSettings((state) => state.settings);
  const user = useSession((state) => state.user);
  const now = useServerNow(1000);
  const owner = `express-group:${id ?? ""}`;
  const proof = usePaymentProof(owner, useExpressPayment);
  const [sheet, setSheet] = useState<"pay" | "qr" | null>(null);
  const [peopleOpen, setPeopleOpen] = useState(false);
  const [ticked, setTicked] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [placeError, setPlaceError] = useState<string | null>(null);

  useEffect(() => {
    useExpressPayment.getState().bind(owner);
    void usePlatformSettings.getState().load().catch(() => undefined);
  }, [owner]);

  useEffect(() => {
    if (!id) return;
    const current = useExpressGroup.getState().byId[id];
    if (current) void useGroupCheckout.getState().start(current);
    else void useExpressGroup.getState().load(id).then((fresh) => fresh && void useGroupCheckout.getState().start(fresh));
  }, [id]);

  const quote = prepared?.quote ?? null;
  const pickup = group?.fulfillmentMode === "pickup";
  const noCash = voucherSettlesUpFront(quote);
  const cash = cashCheckoutChoice(
    settings,
    user,
    quote ? ({ fulfillmentMode: group?.fulfillmentMode, clientQuote: quote } as unknown as api.Cart) : null,
  );
  const cashSelected = cash.eligible && method === "cash";
  const paid = noCash || cashSelected || (proofState.phase === "stored" && Boolean(proofState.fileId) && checkPaymentReference(reference).ok);
  const payLeft = group ? timeLeft(group.payBy, now) : null;
  const members = prepared?.group.members ?? group?.members ?? [];
  const printing = members.filter((member) => member.fileCount > 0);

  const blocker = !group
    ? "Loading the group."
    : !payLeft
      ? "Time to pay ran out."
      : pickup && !prepared && !preparing
        ? "Choose a shop to pick up from."
        : !prepared
          ? "Waiting for the price."
          : !ticked
            ? "Tick that the list looks right."
            : !paid
              ? "Add your payment receipt and reference."
              : !rights
                ? "Tick that these files may be printed."
                : null;

  const applyCode = async (code: string) => {
    if (!prepared) return false;
    try {
      const { voucher } = await api.addVoucherCode(code);
      const result = await api.applyCartVoucher(prepared.cartId, { voucherId: voucher.id });
      if (result.cart.clientQuote) useGroupCheckout.getState().adoptQuote(result.cart.clientQuote);
      return true;
    } catch {
      return false;
    }
  };

  const removeVoucher = async () => {
    if (!prepared) return;
    try {
      const result = await api.removeCartVoucher(prepared.cartId);
      if (result.cart.clientQuote) useGroupCheckout.getState().adoptQuote(result.cart.clientQuote);
    } catch {
      // The quote keeps the voucher; paying still works.
    }
  };

  const place = async () => {
    setAttempted(true);
    if (blocker || !prepared || !group || placing) return;
    setPlacing(true);
    setPlaceError(null);
    try {
      const artworkRights = await artworkRightsPayload();
      const payment = noCash
        ? null
        : cashSelected
          ? ({ method: "cash" } as const)
          : { reference: reference.trim(), proofFileId: proofState.fileId as string };
      const result = await api.checkoutExpressGroup(group.id, { confirmation: prepared.confirmation, payment, artworkRights });
      useExpressGroup.getState().adopt(result.group);
      useExpressPayment.getState().reset();
      useArtworkRights.getState().setAgreed(GROUP_RIGHTS_SCOPE, false);
      useGroupCheckout.getState().reset();
      router.replace({ pathname: "/express/group/[id]", params: { id: group.id } });
    } catch (failure) {
      const code = apiErrorCode(failure);
      if (code === "express_preview_required" || code === "group_preview_required" || code === "express_shop_unavailable") {
        void useGroupCheckout.getState().prepare();
        setPlaceError(code === "express_shop_unavailable" ? "That shop just closed. GRIDGO is finding the group another." : "Something changed. Check the new total, then pay.");
      } else if (code && code.startsWith("cash_")) {
        useExpressPayment.getState().chooseMethod("qr_manual");
        setPlaceError(cashErrorMessage(code));
      } else if (code === "group_cash_limit_exceeded") {
        useExpressPayment.getState().chooseMethod("qr_manual");
        setPlaceError(groupError(failure, "Pay by QR instead."));
      } else {
        setPlaceError(groupError(failure, "The order was not placed. Try again."));
      }
    } finally {
      setPlacing(false);
    }
  };

  const payValue = noCash
    ? "Voucher covers it"
    : cashSelected
      ? "Cash on delivery"
      : proofState.phase === "stored"
        ? "QR Ph · receipt added"
        : "QR Ph · add receipt";
  const voucherOff = quote?.voucherDiscountMinor ?? 0;
  const message = placeError ?? prepareError ?? (attempted ? blocker : null);

  const footer = (
    <View className="gap-2 border-t border-outline-subtle bg-surface px-4 pb-2 pt-2">
      <CheckboxRow checked={ticked} onChange={setTicked} label="The list looks right" hint="Each person set their own pages and copies" />
      {message ? (
        <Text className="text-caption text-error" accessibilityRole="alert">
          {message}
        </Text>
      ) : null}
      <Pressable
        onPress={() => void place()}
        // Stays pressable while something is missing, so a press says what.
        disabled={placing}
        accessibilityRole="button"
        accessibilityHint={blocker ?? undefined}
        className={placing || blocker ? "gg-btn-primary gg-disabled" : "gg-btn-primary"}
      >
        <Text className="text-button text-action-yellow-on">
          {placing ? "Placing order…" : `Pay for the group${quote?.totalMinor != null ? ` · ${api.formatPhp(quote.totalMinor)}` : ""}`}
        </Text>
      </Pressable>
    </View>
  );

  return (
    <FormScreen footer={footer} contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 24 }}>
      <View className="flex-row items-center justify-between gap-3">
        <Text className="min-w-0 flex-1 text-body text-text-secondary">You pay GRIDGO once for everyone.</Text>
        {payLeft ? (
          <Text className="text-body font-bold text-text-primary" accessibilityLabel={`${payLeft} left to pay`} style={{ fontVariant: ["tabular-nums"] }}>
            {payLeft} left
          </Text>
        ) : null}
      </View>

      {pickup ? (
        <View className="gap-2">
          <Text className="text-body font-bold text-text-primary">Pick up from</Text>
          <ShopChoice />
        </View>
      ) : prepared?.shop ? (
        <View className="flex-row items-center gap-3 rounded-card border border-outline bg-surface px-4 py-3">
          <Store size={18} color={colors.textSecondary} strokeWidth={2} aria-hidden />
          <View className="min-w-0 flex-1">
            <Text className="text-body font-bold text-text-primary" numberOfLines={1}>
              {prepared.shop.name}
            </Text>
            <Text className="text-caption text-text-secondary" numberOfLines={1}>
              Nearest open shop · {distanceLabel(prepared.shop.distanceMeters)} · delivers to {group?.dropoff?.label ?? "you"}
            </Text>
          </View>
        </View>
      ) : null}

      <View className="gg-card-flush">
        <ExpressRow
          icon={Users}
          title="Prints by person"
          value={`${printing.length} ${printing.length === 1 ? "person" : "people"} · ${pagesLine(printing.reduce((sum, member) => sum + (member.pageCount ?? 0), 0))}`}
          open={peopleOpen}
          onToggle={() => setPeopleOpen((open) => !open)}
          divided={false}
        >
          <View className="-mx-4">
            {printing.map((member, index) => (
              <MemberRow key={member.userId} member={member} isHostRow={member.userId === group?.host.id} divided={index > 0} onManage={null} showPaidBack={false} />
            ))}
          </View>
        </ExpressRow>
        <ExpressRow icon={Wallet} title="Pay with" value={payValue} onToggle={() => setSheet("pay")} />
        {quote ? (
          <View className="gap-1 border-t border-outline-subtle px-4 pb-3 pt-3">
            <MoneyLine label="Printing" value={api.formatPhp(quote.clientItemSubtotalMinor ?? 0)} />
            {group?.fulfillmentMode === "delivery" ? <MoneyLine label="Delivery, once" value={quote.deliveryFeeMinor != null ? api.formatPhp(quote.deliveryFeeMinor) : "—"} /> : null}
            {voucherOff > 0 ? (
              <View className="flex-row items-center justify-between py-0.5">
                <Text className="min-w-0 flex-1 text-body text-text-secondary" numberOfLines={1}>
                  {quote.voucher?.name ?? "Voucher"}
                </Text>
                <Text className="text-body text-success">−{api.formatPhp(voucherOff)}</Text>
                <Pressable onPress={() => void removeVoucher()} accessibilityRole="button" accessibilityLabel="Remove voucher" className="gg-touch items-center justify-center">
                  <X size={16} color={colors.textMuted} strokeWidth={2} aria-hidden />
                </Pressable>
              </View>
            ) : null}
            <View className="my-1 h-px bg-outline-subtle" />
            <MoneyLine label="Total" value={quote.totalMinor != null ? api.formatPhp(quote.totalMinor) : "—"} strong />
            {voucherOff > 0 ? null : (
              <View className="mt-3 border-t border-outline-subtle pt-3">
                <VoucherCodeField onSubmit={applyCode} label="Voucher code" />
              </View>
            )}
          </View>
        ) : (
          <View className="flex-row items-center gap-3 border-t border-outline-subtle px-4 py-3">
            <Receipt size={18} color={colors.textSecondary} strokeWidth={2} aria-hidden />
            <Text className="min-w-0 flex-1 text-body text-text-secondary">
              {preparing ? "Pricing everyone's files…" : pickup ? "Choose a shop to see the total." : "Not priced yet."}
            </Text>
          </View>
        )}
      </View>

      <Text className="text-caption text-text-muted">
        {group ? `Each person pays you back what their row says, in cash or by e-wallet, outside the app. GRIDGO only collects from you, ${firstName(group.host.name)}.` : ""}
      </Text>

      <ArtworkRightsBox scope={GROUP_RIGHTS_SCOPE} onOpen={(href: Href) => router.push(href)} />

      <PayWithSheet
        open={sheet === "pay"}
        onClose={() => setSheet(null)}
        onShowQr={() => setSheet("qr")}
        proof={proof}
        cash={cash}
        amountMinor={quote?.downpaymentMinor ?? quote?.totalMinor ?? null}
      />
      <QrPaySheet
        open={sheet === "qr"}
        onClose={() => setSheet("pay")}
        downpaymentMinor={quote?.downpaymentMinor ?? quote?.totalMinor ?? 0}
        downpaymentPercent={100}
        imageUrl={paymentQrFromSettings(settings)?.imageUrl}
      />
    </FormScreen>
  );
}
