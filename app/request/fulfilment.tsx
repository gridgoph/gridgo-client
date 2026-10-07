import { Check, ChevronRight, MapPin, Package, Plus, Truck, type LucideIcon } from "lucide-react-native";
import { useCallback, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";

import { ErrorState } from "@/components/ErrorState";
import { HubPickupPanel } from "@/components/HubPickupPanel";
import { PrimaryButton } from "@/components/PrimaryButton";
import { Screen } from "@/components/Screen";
import { SkeletonLine } from "@/components/Skeleton";
import { useLiveRefresh } from "@/hooks/useLiveRefresh";
import { useThemeColors } from "@/hooks/useTheme";
import * as api from "@/lib/api";
import type { ClientAddress, FulfilmentMode, OrderPoint } from "@/lib/api";
import { userFacingError } from "@/lib/copy";
import { hubFeeLabel, hubPickupOf, hubPickupEnabled } from "@/lib/hubPickup";
import { prefetchMatch } from "@/lib/matchPrefetch";
import {
  PICKUP_CHOICE,
  deliveryChoice,
  fulfilmentBlurb,
  fulfilmentTitle,
} from "@/lib/requestFulfilment";
import { useJobDeadline } from "@/store/jobDeadline";
import { useJobFulfilment, withJobFulfilment } from "@/store/jobFulfilment";
import { withJobRanking } from "@/store/orderRanking";
import { usePlatformSettings } from "@/store/platformSettings";

/**
 * Delivery or pick-up, asked straight after the date (gridgoph/gridgo-client#158).
 *
 * The match is measured from the answer — the client's door for a delivery,
 * GRIDGO Office for a pick-up — so it has to come before the match rather
 * than at checkout, where it used to sit after a press had already been chosen
 * without knowing where the job was going. Checkout reads it back and does not
 * ask again.
 *
 * The address is asked here and only here: never during onboarding. A saved
 * address is one tap; a new one goes through the same pin editor as everywhere
 * else (`app/request/where.tsx`).
 *
 * Pick-up shows the hub's hours and fee from GRIDGO's settings. Nothing is
 * assumed: no hours set reads as no hours set, and a zero fee reads "Free".
 */
export default function FulfilmentScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const { subcategory, category } = useLocalSearchParams<{ subcategory?: string; category?: string }>();

  const held = useJobFulfilment((state) => state.choice);
  const setChoice = useJobFulfilment((state) => state.set);
  const settings = usePlatformSettings((state) => state.settings);
  const loadSettings = usePlatformSettings((state) => state.load);

  const [selectedMode, setMode] = useState<FulfilmentMode | null>(held?.fulfillmentMode ?? null);
  const pickupAvailable = hubPickupEnabled(settings);
  const mode = pickupAvailable ? selectedMode : "delivery";
  const [dropoff, setDropoff] = useState<OrderPoint | null>(
    held?.fulfillmentMode === "delivery" ? held.dropoff : null,
  );
  const [addresses, setAddresses] = useState<ClientAddress[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempted, setAttempted] = useState(false);

  const refreshSettings = useCallback(() => loadSettings({ refresh: true }), [loadSettings]);
  useLiveRefresh(["settings"], refreshSettings, { refreshOnFocus: false });

  // Fresh availability, hours and fee on every visit.
  useFocusEffect(useCallback(() => {
    void loadSettings({ refresh: true }).catch(() => undefined);
  }, [loadSettings]));

  // Re-read on focus, so an address added on the pin editor is in the list
  // when the client comes back to choose it.
  const loadAddresses = useCallback(() => {
    return api
      .listAddresses()
      .then((list) => {
        setAddresses(list);
        setLoadError(null);
      })
      .catch((error) => {
        setAddresses((current) => current ?? []);
        setLoadError(
          userFacingError(error, "GRIDGO could not read your saved addresses. You can still add one."),
        );
      });
  }, []);
  useFocusEffect(
    useCallback(() => {
      void loadAddresses();
    }, [loadAddresses]),
  );

  // An address set on the pin editor comes back through the store. Adopted
  // during render, the way the listing sheet restores a line, so the new
  // address is selected on the first paint after coming back.
  const [seen, setSeen] = useState(held);
  if (seen !== held) {
    setSeen(held);
    if (held?.fulfillmentMode === "delivery" && held.dropoff) {
      setMode("delivery");
      setDropoff(held.dropoff);
    }
  }

  // Delivery with nothing picked yet starts on the client's default address,
  // the one they would have typed anyway.
  const fallback = addresses?.find((address) => address.isDefault) ?? addresses?.[0] ?? null;
  const chosen = dropoff ?? (fallback ? pointOf(fallback) : null);

  const hub = hubPickupOf(settings);
  const fee = hubFeeLabel(hub?.feeMinor);
  const ready = mode === "pickup" || (mode === "delivery" && chosen != null);

  const addAddress = () =>
    router.push({
      pathname: "/request/where",
      params: { subcategory: subcategory ?? "", category: category ?? "", next: "fulfilment" },
    });

  const proceed = () => {
    // Delivery with nothing saved to choose from: the address is the next
    // thing to do, so the button goes there rather than scolding.
    if (mode === "delivery" && !chosen && addresses?.length === 0) {
      addAddress();
      return;
    }
    if (!ready) {
      setAttempted(true);
      return;
    }
    const choice = mode === "pickup" ? PICKUP_CHOICE : deliveryChoice(chosen as OrderPoint);
    setChoice(choice);
    // The match on the usual order starts now, while the client confirms or
    // re-ranks on the next step.
    if (subcategory) {
      prefetchMatch(
        withJobRanking(
          withJobFulfilment({ subcategoryCode: subcategory, deadline: useJobDeadline.getState().by }, null),
        ),
      );
    }
    router.push({
      pathname: "/request/rank",
      params: { subcategory: subcategory ?? "", category: category ?? "" },
    });
  };

  return (
    <Screen edges={["bottom"]}>
      <ScrollView className="gg-screen" contentContainerClassName="gg-page pb-8 pt-2">
        <Text className="text-h2 text-text-primary">How should it reach you?</Text>
        <Text className="mt-2 text-body-lg text-text-secondary">
          GRIDGO matches a printer for where it is going, so this comes first.
        </Text>

        <View className="mt-6 gap-3" accessibilityRole="radiogroup" accessibilityLabel={pickupAvailable ? "Delivery or pick-up" : "Delivery"}>
          <ChoiceRow
            icon={Truck}
            title={fulfilmentTitle("delivery")}
            body={fulfilmentBlurb("delivery")}
            aside="Priced by zone"
            selected={mode === "delivery"}
            onPress={() => setMode("delivery")}
          />
          {pickupAvailable ? <ChoiceRow
            icon={Package}
            title={fulfilmentTitle("pickup")}
            body={fulfilmentBlurb("pickup")}
            aside={fee}
            selected={mode === "pickup"}
            onPress={() => setMode("pickup")}
          /> : null}
        </View>

        {mode === "delivery" ? (
          <View className="mt-8 gap-3">
            <Text className="text-overline text-text-muted">DELIVER TO</Text>
            {loadError ? (
              <ErrorState label="Saved addresses" body={loadError} onRetry={() => void loadAddresses()} />
            ) : null}
            {addresses == null ? (
              <View className="gg-card-flush gap-2 p-4" accessibilityLabel="Reading your addresses">
                <SkeletonLine width="w-1/3" />
                <SkeletonLine width="w-2/3" />
              </View>
            ) : (
              <View className="gg-card-flush">
                {[...addresses, ...extraPoint(addresses, dropoff)].map((address, index) => (
                  <AddressRow
                    key={address.id}
                    title={address.label}
                    line={address.addressLine}
                    selected={chosen != null && samePoint(chosen, address.point)}
                    first={index === 0}
                    onPress={() => setDropoff(pointOf(address))}
                  />
                ))}
                <Pressable
                  onPress={addAddress}
                  accessibilityRole="button"
                  accessibilityLabel="Add a new address"
                  className={
                    addresses.length || dropoff
                      ? "gg-touch flex-row items-center gap-3 border-t border-outline-subtle p-4"
                      : "gg-touch flex-row items-center gap-3 p-4"
                  }
                  style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
                >
                  <Plus size={18} color={colors.textPrimary} strokeWidth={2.25} aria-hidden />
                  <Text className="min-w-0 flex-1 text-body font-medium text-text-primary">
                    {addresses.length ? "Add a new address" : "Add your delivery address"}
                  </Text>
                  <ChevronRight size={16} color={colors.textMuted} strokeWidth={2} aria-hidden />
                </Pressable>
              </View>
            )}
            <Text className="text-caption text-text-muted">
              Delivery is charged by how far the printer is from this pin. Checkout shows the
              amount.
            </Text>
          </View>
        ) : null}

        {mode === "pickup" ? (
          <View className="mt-8 gap-3">
            <Text className="text-overline text-text-muted">COLLECT AT</Text>
            <HubPickupPanel hub={hub} showFee={false} />
          </View>
        ) : null}
      </ScrollView>

      <View className="gg-page gap-2 pb-2 pt-2">
        <PrimaryButton
          label={ready || !mode ? "Continue" : addresses?.length === 0 ? "Add an address" : "Choose an address"}
          onPress={proceed}
        />
        {attempted && !ready ? (
          <Text className="text-center text-caption text-error" accessibilityLiveRegion="polite">
            {mode ? "Choose where it is going, or add an address." : "Choose delivery or pick-up."}
          </Text>
        ) : null}
      </View>
    </Screen>
  );
}

function pointOf(address: ClientAddress): OrderPoint {
  return { lat: address.point.lat, lng: address.point.lng, label: address.addressLine || address.label };
}

function samePoint(left: OrderPoint, right: OrderPoint): boolean {
  return left.lat === right.lat && left.lng === right.lng;
}

/**
 * A point chosen on the pin editor that is not (yet) in the saved list — the
 * save may still be settling — drawn as its own row so the selection is seen.
 */
function extraPoint(addresses: ClientAddress[], dropoff: OrderPoint | null): ClientAddress[] {
  if (!dropoff || addresses.some((address) => samePoint(address.point, dropoff))) return [];
  return [
    {
      id: "chosen-point",
      label: "New address",
      addressLine: dropoff.label ?? "",
      point: dropoff,
      isDefault: false,
      version: 0,
      createdAt: "",
      updatedAt: "",
    },
  ];
}

/**
 * One of the two answers. Monochrome when chosen — an accent edge and a filled
 * mark — because the screen's one yellow is Continue.
 */
function ChoiceRow({
  icon: Icon,
  title,
  body,
  aside,
  selected,
  onPress,
}: {
  icon: LucideIcon;
  title: string;
  body: string;
  aside: string | null;
  selected: boolean;
  onPress: () => void;
}) {
  const colors = useThemeColors();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected, checked: selected }}
      accessibilityLabel={`${title}. ${body}${aside ? ` ${aside}.` : ""}`}
      className={
        selected
          ? "gg-card-flush gg-touch flex-row items-start gap-3 border-2 border-accent p-4"
          : "gg-card-flush gg-touch flex-row items-start gap-3 border-2 border-transparent p-4"
      }
      style={({ pressed }) => (pressed ? { opacity: 0.85 } : undefined)}
    >
      <View className="mt-0.5 h-10 w-10 items-center justify-center rounded-pill bg-surface-variant" aria-hidden>
        <Icon size={20} color={colors.textPrimary} strokeWidth={2} />
      </View>
      <View className="min-w-0 flex-1 gap-1">
        <View className="flex-row items-baseline justify-between gap-2">
          <Text className="min-w-0 flex-1 text-body-lg font-bold text-text-primary">{title}</Text>
          {aside ? <Text className="text-caption text-text-secondary">{aside}</Text> : null}
        </View>
        <Text className="text-body text-text-secondary">{body}</Text>
      </View>
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

function AddressRow({
  title,
  line,
  selected,
  first,
  onPress,
}: {
  title: string;
  line: string;
  selected: boolean;
  first: boolean;
  onPress: () => void;
}) {
  const colors = useThemeColors();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected, checked: selected }}
      accessibilityLabel={`Deliver to ${title}${line ? `, ${line}` : ""}`}
      className={
        first
          ? "gg-touch flex-row items-center gap-3 p-4"
          : "gg-touch flex-row items-center gap-3 border-t border-outline-subtle p-4"
      }
      style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
    >
      <MapPin size={18} color={selected ? colors.textPrimary : colors.textMuted} strokeWidth={2} aria-hidden />
      <View className="min-w-0 flex-1">
        <Text className="text-body font-medium text-text-primary">{title}</Text>
        {line ? (
          <Text className="text-caption text-text-muted" numberOfLines={2}>
            {line}
          </Text>
        ) : null}
      </View>
      {selected ? <Check size={18} color={colors.textPrimary} strokeWidth={2.5} aria-hidden /> : null}
    </Pressable>
  );
}
