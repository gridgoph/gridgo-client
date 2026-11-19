import { useRouter } from "expo-router";
import { Banknote, Check, Clock, LocateFixed, MapPin, Plus, QrCode } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

import { ChoiceChips } from "@/components/express/ExpressChrome";
import { FormField } from "@/components/form/FormField";
import { TextField } from "@/components/form/TextField";
import { PaymentProofRow } from "@/components/PaymentProofRow";
import { Sheet } from "@/components/Sheet";
import { useThemeColors } from "@/hooks/useTheme";
import * as api from "@/lib/api";
import { requestCurrentLocation } from "@/lib/deviceLocation";
import { distanceLabel, readyLine, SORT_OPTIONS, sortExpressShops } from "@/lib/express";
import { checkPaymentReference } from "@/lib/payment";
import type { usePaymentProof } from "@/hooks/usePaymentProof";
import { useExpress } from "@/store/express";
import { useExpressPayment } from "@/store/checkoutPayment";

/** Rating, distance, queue and ready time on one line. */
export function shopFacts(shop: api.ExpressShop): string {
  return [
    shop.rating ? `★ ${shop.rating.average.toFixed(1)}` : null,
    distanceLabel(shop.distanceMeters),
    shop.jobsAhead ? `${shop.jobsAhead} ahead` : "No queue",
    readyLine(shop.readyAt),
  ]
    .filter(Boolean)
    .join(" · ");
}

function Tag({ label, tone }: { label: string; tone: "info" | "warning" }) {
  return (
    <View className={tone === "info" ? "rounded-pill border border-info px-2" : "rounded-pill border border-warning px-2"}>
      <Text className={tone === "info" ? "text-caption font-medium text-info" : "text-caption font-medium text-warning"}>{label}</Text>
    </View>
  );
}

export function ShopTags({ shop }: { shop: api.ExpressShop }) {
  if (!shop.isNew && !shop.busy) return null;
  return (
    <View className="flex-row gap-1">
      {shop.isNew ? <Tag label="New" tone="info" /> : null}
      {shop.busy ? <Tag label="Busy" tone="warning" /> : null}
    </View>
  );
}

/** Open Express shops near the client, sorted three ways. Same price at every one. */
export function ShopSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const colors = useThemeColors();
  const shops = useExpress((state) => state.shops);
  const shopsError = useExpress((state) => state.shopsError);
  const sort = useExpress((state) => state.sort);
  const supplierId = useExpress((state) => state.supplierId);
  const rows = sortExpressShops(shops ?? [], sort);
  return (
    <Sheet open={open} onClose={onClose} title="Choose a shop" subtitle="Same price at every shop" maxHeightRatio={0.8}>
      <View className="px-4 pb-2 pt-3 gap-3">
        <ChoiceChips label="Sort shops" options={SORT_OPTIONS} value={sort} onChange={(next) => useExpress.getState().setSort(next)} />
        {shopsError ? <Text className="text-caption text-error">{shopsError}</Text> : null}
        {shops && !rows.length ? (
          <Text className="py-6 text-center text-body text-text-secondary">No Express shop is open near you right now.</Text>
        ) : null}
        <ScrollView style={{ maxHeight: 420 }} contentContainerStyle={{ gap: 8 }}>
          {rows.map((shop) => {
            const chosen = shop.supplierId === supplierId;
            return (
              <Pressable
                key={shop.supplierId}
                onPress={() => {
                  useExpress.getState().chooseShop(shop.supplierId);
                  onClose();
                }}
                accessibilityRole="radio"
                accessibilityState={{ selected: chosen }}
                accessibilityLabel={`${shop.name}${shop.isNew ? ", new" : ""}${shop.busy ? ", busy" : ""}. ${shopFacts(shop)}`}
                className={
                  chosen
                    ? "flex-row items-center gap-3 rounded-card border-2 border-accent bg-surface-high px-3 py-2.5"
                    : "flex-row items-center gap-3 rounded-card border-2 border-outline bg-surface px-3 py-2.5"
                }
              >
                <View className="min-w-0 flex-1 gap-0.5">
                  <View className="flex-row items-center gap-2">
                    <Text className="min-w-0 shrink text-body font-bold text-text-primary" numberOfLines={1}>
                      {shop.name}
                    </Text>
                    <ShopTags shop={shop} />
                  </View>
                  <Text className="text-caption text-text-secondary" numberOfLines={1}>
                    {shopFacts(shop)}
                  </Text>
                </View>
                {chosen ? <Check size={20} color={colors.textPrimary} strokeWidth={2.5} aria-hidden /> : null}
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
    </Sheet>
  );
}

/**
 * Where the client is. Shops are measured from here, and a delivery goes
 * here. A delivery needs a saved place (a rider needs the words); picking up
 * may use the phone's location, asked for only on this tap.
 */
export function PlaceSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const colors = useThemeColors();
  const fulfilment = useExpress((state) => state.fulfilment);
  const place = useExpress((state) => state.place);
  const [addresses, setAddresses] = useState<api.ClientAddress[] | null>(null);
  const [locating, setLocating] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    api
      .listAddresses()
      .then((rows) => alive && setAddresses(rows))
      .catch(() => alive && setAddresses([]));
    return () => {
      alive = false;
    };
  }, [open]);

  const locateMe = async () => {
    setLocating(true);
    setNote(null);
    const result = await requestCurrentLocation();
    setLocating(false);
    if (result.status !== "ok") {
      setNote(result.message);
      return;
    }
    useExpress.getState().setPlace({ lat: result.point.lat, lng: result.point.lng, label: "My location", addressId: null });
    onClose();
  };

  return (
    <Sheet open={open} onClose={onClose} title={fulfilment === "delivery" ? "Deliver to" : "Find shops near"}>
      <View className="px-4 pb-2 pt-3 gap-2">
        {fulfilment === "pickup" ? (
          <Pressable
            onPress={() => void locateMe()}
            disabled={locating}
            accessibilityRole="button"
            className="min-h-12 flex-row items-center gap-3 rounded-card border border-outline bg-surface px-3"
          >
            <LocateFixed size={20} color={colors.textPrimary} strokeWidth={2} aria-hidden />
            <Text className="min-w-0 flex-1 text-body font-medium text-text-primary">{locating ? "Finding you…" : "Use my location"}</Text>
            {place && !place.addressId ? <Check size={18} color={colors.textPrimary} strokeWidth={2.5} aria-hidden /> : null}
          </Pressable>
        ) : null}
        {note ? <Text className="text-caption text-error">{note}</Text> : null}
        {(addresses ?? []).map((address) => {
          const chosen = place?.addressId === address.id;
          return (
            <Pressable
              key={address.id}
              onPress={() => {
                useExpress.getState().setPlace({
                  lat: address.point.lat,
                  lng: address.point.lng,
                  label: address.addressLine || address.label,
                  addressId: address.id,
                });
                onClose();
              }}
              accessibilityRole="radio"
              accessibilityState={{ selected: chosen }}
              className="min-h-12 flex-row items-center gap-3 rounded-card border border-outline bg-surface px-3 py-2"
            >
              <MapPin size={20} color={colors.textSecondary} strokeWidth={2} aria-hidden />
              <View className="min-w-0 flex-1">
                <Text className="text-body font-medium text-text-primary" numberOfLines={1}>{address.label}</Text>
                <Text className="text-caption text-text-muted" numberOfLines={1}>{address.addressLine}</Text>
              </View>
              {chosen ? <Check size={18} color={colors.textPrimary} strokeWidth={2.5} aria-hidden /> : null}
            </Pressable>
          );
        })}
        <Pressable
          onPress={() => {
            onClose();
            router.push("/saved-place");
          }}
          accessibilityRole="button"
          className="min-h-12 flex-row items-center gap-3 px-3"
        >
          <Plus size={20} color={colors.textPrimary} strokeWidth={2} aria-hidden />
          <Text className="text-body font-medium text-text-primary">Add a place</Text>
        </Pressable>
      </View>
    </Sheet>
  );
}

/**
 * Today's payment options: GRIDGO's QR with the receipt screenshot and its
 * reference, or cash on delivery where GRIDGO allows it. Nothing reads as paid
 * here — Operations confirms the transfer.
 */
export function PayWithSheet({
  open,
  onClose,
  onShowQr,
  proof,
  cash,
  amountMinor,
}: {
  open: boolean;
  onClose: () => void;
  onShowQr: () => void;
  proof: ReturnType<typeof usePaymentProof>;
  cash: { eligible: boolean; reason: string | null };
  amountMinor: number | null;
}) {
  const colors = useThemeColors();
  const method = useExpressPayment((state) => state.method);
  const reference = useExpressPayment((state) => state.reference);
  const [touched, setTouched] = useState(false);
  const check = checkPaymentReference(reference);
  const reading = proof.ocr.status === "reading";

  return (
    <Sheet open={open} onClose={onClose} title="Pay with" subtitle={amountMinor != null ? `${api.formatPhp(amountMinor)} to GRIDGO` : undefined} maxHeightRatio={0.9}>
      <View className="px-4 pb-2 pt-3 gap-3">
        <ChoiceChips
          label="Payment method"
          options={[
            { value: "qr_manual", label: "QR Ph" },
            ...(cash.eligible ? [{ value: "cash" as const, label: "Cash on delivery" }] : []),
          ]}
          value={method}
          onChange={(next) => useExpressPayment.getState().chooseMethod(next)}
        />
        {method === "cash" ? (
          <View className="flex-row items-center gap-3 rounded-card border border-outline bg-surface p-3">
            <Banknote size={20} color={colors.textPrimary} strokeWidth={2} aria-hidden />
            <Text className="min-w-0 flex-1 text-body text-text-secondary">Pay the rider when it arrives.</Text>
          </View>
        ) : (
          <>
            <Pressable
              onPress={onShowQr}
              accessibilityRole="button"
              className="min-h-12 flex-row items-center gap-3 rounded-card border border-outline bg-surface px-3"
            >
              <QrCode size={20} color={colors.textPrimary} strokeWidth={2} aria-hidden />
              <Text className="min-w-0 flex-1 text-body font-medium text-text-primary">Show the QR to scan</Text>
            </Pressable>
            <PaymentProofRow
              state={proof.state}
              reading={reading}
              error={null}
              onPick={() => void proof.pick()}
              onView={() => undefined}
              onReset={proof.reset}
            />
            <FormField
              label="Payment reference"
              error={!reading && touched && !check.ok ? check.reason : null}
              helper={reading ? "Reading the receipt…" : "On the receipt from your wallet app"}
            >
              <TextField
                value={reference}
                onChangeText={(next) => useExpressPayment.getState().setReference(next)}
                onBlur={() => setTouched(true)}
                placeholder="e.g. 1234567890123"
                accessibilityLabel="Payment reference"
                autoCapitalize="characters"
                autoCorrect={false}
                maxLength={100}
                editable={!reading}
              />
            </FormField>
          </>
        )}
        {!cash.eligible && cash.reason ? (
          <View className="flex-row items-center gap-2">
            <Clock size={14} color={colors.textMuted} strokeWidth={2} aria-hidden />
            <Text className="min-w-0 flex-1 text-caption text-text-muted">{cash.reason}</Text>
          </View>
        ) : null}
        <Pressable onPress={onClose} accessibilityRole="button" className="gg-btn-secondary">
          <Text className="text-button text-text-primary">Done</Text>
        </Pressable>
      </View>
    </Sheet>
  );
}

