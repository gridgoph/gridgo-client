import { Check, MapPin } from "lucide-react-native";
import { useCallback, useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import { ErrorState } from "@/components/ErrorState";
import { FormScreen } from "@/components/FormScreen";
import { FormField } from "@/components/form/FormField";
import { TextField } from "@/components/form/TextField";
import { PinPicker } from "@/components/PinPicker";
import { useThemeColors } from "@/hooks/useTheme";
import * as api from "@/lib/api";
import type { ClientAddress, OrderPoint } from "@/lib/api";
import { checkAddress, composeAddress, DELIVERY_CITY } from "@/lib/address";
import { userFacingError } from "@/lib/copy";
import { prefetchMatch } from "@/lib/matchPrefetch";
import type { GeoPoint } from "@/lib/tracking";
import { useCart } from "@/store/cart";

/**
 * Where is this going?
 *
 * Asked before the match when it changes the match: a client who put distance
 * first is asking GRIDGO to pick the nearest press, and the matcher refuses
 * without a drop-off because "nearest" has no meaning until it knows what it is
 * near. Everyone else is asked at checkout instead, where the address is needed
 * for the delivery charge rather than for the choice of shop.
 *
 * Two ways in: an address already on the account, or a new one. The pin is not
 * decoration — GRIDGO measures the delivery band from it, and `POST
 * /me/addresses` will not take an address without one — so the map leads rather
 * than sitting as an afterthought under the form.
 *
 * Current location is deliberately absent. Reading the device's position needs
 * a library this app does not carry, and a button that asks for a permission
 * nothing can grant is worse than one that is not there.
 */
export default function WhereScreen() {
  const router = useRouter();
  const { subcategory, category, next } = useLocalSearchParams<{
    subcategory?: string;
    category?: string;
    next?: string;
  }>();

  const adopt = useCart((state) => state.adopt);
  const run = useCart((state) => state.run);

  const [saved, setSaved] = useState<ClientAddress[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [line1, setLine1] = useState("");
  const [barangay, setBarangay] = useState("");
  const [landmark, setLandmark] = useState("");
  const [point, setPoint] = useState<GeoPoint | null>(null);
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setSaved(await api.listAddresses());
      setLoadError(null);
    } catch (error) {
      setSaved([]);
      setLoadError(
        userFacingError(
          error,
          "GRIDGO could not read your saved addresses. You can still set a new one.",
        ),
      );
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const parts = { line1, barangay, landmark };
  const addressCheck = checkAddress(parts);

  /** Put the drop-off on the basket, then carry on where this came from. */
  const applyDropoff = useCallback(
    async (dropoff: OrderPoint) => {
      const cart = await run((cartId) =>
        api.setCartDropoffs(cartId, { defaultDropoff: dropoff }),
      );
      adopt(cart);
      const target = next === "checkout" ? "/checkout" : "/request/match";
      if (target === "/request/match" && subcategory) {
        prefetchMatch({
          subcategoryCode: subcategory,
          dropoff,
          cartId: cart.id,
        });
      }
      router.replace({
        pathname: target,
        params: subcategory ? { subcategory, category: category ?? "" } : {},
      });
    },
    [run, adopt, router, next, subcategory, category],
  );

  const chooseSaved = async (address: ClientAddress) => {
    if (busy) return;
    setBusy(true);
    setSaveError(null);
    try {
      await applyDropoff({ ...address.point, label: address.addressLine });
    } catch (error) {
      setSaveError(
        userFacingError(error, "GRIDGO could not use that address. Try again in a moment."),
      );
      setBusy(false);
    }
  };

  const saveAndGo = async () => {
    setTouched(true);
    if (!addressCheck.ok || !point || busy) return;
    setBusy(true);
    setSaveError(null);
    const addressLine = composeAddress(parts);
    try {
      const address = await api.saveAddress({
        // An unnamed place is still labelled, so the list can be read next
        // time. GRIDGO caps a label at 80 characters and a composed Davao
        // address can run past that, so it is trimmed rather than refused.
        label: (label.trim() || addressLine).slice(0, 80),
        addressLine,
        point: { ...point, label: addressLine },
        isDefault: (saved?.length ?? 0) === 0,
      });
      await applyDropoff({ ...address.point, label: address.addressLine });
    } catch (error) {
      setSaveError(
        userFacingError(error, "GRIDGO could not save that address. Try again in a moment."),
      );
      setBusy(false);
    }
  };

  const ready = addressCheck.ok && Boolean(point);

  return (
    <FormScreen>
      <View className="gg-page gap-8 pb-16 pt-2">
        <View className="gap-3">
          <Text className="text-h1 text-text-primary">Where is it going?</Text>
          <Text className="text-body-lg text-text-secondary">
            {next === "checkout"
              ? "GRIDGO charges delivery by the distance from where it is printed to this pin."
              : "You put distance first, so GRIDGO needs the drop-off before it can find your nearest printer."}
          </Text>
        </View>

        {loadError ? (
          <ErrorState label="Saved addresses" body={loadError} onRetry={() => void load()} />
        ) : null}

        {saved?.length ? (
          <View className="gap-3">
            <Text className="text-overline text-text-muted">YOUR ADDRESSES</Text>
            {saved.map((address) => (
              <SavedAddressRow
                key={address.id}
                address={address}
                disabled={busy}
                onUse={() => void chooseSaved(address)}
              />
            ))}
          </View>
        ) : null}

        <View className="gap-4">
          <Text className="text-overline text-text-muted">
            {saved?.length ? "OR SET A NEW ONE" : "SET THE DROP-OFF"}
          </Text>

          <PinPicker point={point} onPick={setPoint} />

          <FormField
            label="Name this place"
            optional
            helper="“Home”, “Office”, “Shop” — so you can pick it next time."
          >
            <TextField
              value={label}
              onChangeText={setLabel}
              placeholder="Office"
              accessibilityLabel="Name this place"
              maxLength={60}
              autoCapitalize="words"
            />
          </FormField>

          <FormField
            label="Street and building"
            error={touched && addressCheck.field === "line1" ? addressCheck.reason : null}
            helper={`Number, street and building. ${DELIVERY_CITY} is assumed.`}
          >
            <TextField
              value={line1}
              onChangeText={setLine1}
              placeholder="12 Quimpo Blvd, Unit 3"
              accessibilityLabel="Street and building"
              autoCapitalize="words"
            />
          </FormField>

          <FormField
            label="Barangay"
            error={touched && addressCheck.field === "barangay" ? addressCheck.reason : null}
          >
            <TextField
              value={barangay}
              onChangeText={setBarangay}
              placeholder="Talomo"
              accessibilityLabel="Barangay"
              autoCapitalize="words"
            />
          </FormField>

          <FormField
            label="Landmark"
            optional
            helper="What the rider should look for when they are on the street."
          >
            <TextField
              value={landmark}
              onChangeText={setLandmark}
              placeholder="Beside the blue gate"
              accessibilityLabel="Landmark"
              autoCapitalize="sentences"
            />
          </FormField>
        </View>

        {saveError ? <Text className="text-body text-error">{saveError}</Text> : null}

        <View className="gap-3">
          <Pressable
            onPress={() => void saveAndGo()}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel="Save this address and continue"
            accessibilityState={{ disabled: busy }}
            className={busy ? "gg-btn-primary gg-disabled" : "gg-btn-primary"}
            style={({ pressed }) => (pressed && !busy ? { opacity: 0.9 } : undefined)}
          >
            <Text className="text-button text-action-yellow-on">
              {busy ? "Saving…" : next === "checkout" ? "Save this address" : "Find my printer"}
            </Text>
          </Pressable>
          {touched && !ready ? (
            <Text className="text-center text-caption text-text-muted">
              {point
                ? "Fill in the street and barangay so a rider can find it."
                : "Tap the map to drop a pin — GRIDGO prices delivery from it."}
            </Text>
          ) : null}
        </View>
      </View>
    </FormScreen>
  );
}

function SavedAddressRow({
  address,
  disabled,
  onUse,
}: {
  address: ClientAddress;
  disabled: boolean;
  onUse: () => void;
}) {
  const colors = useThemeColors();

  return (
    <Pressable
      onPress={onUse}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={`Deliver to ${address.label}`}
      accessibilityState={{ disabled }}
      className={
        disabled
          ? "gg-card-flush gg-disabled flex-row items-center gap-3 p-4"
          : "gg-card-flush flex-row items-center gap-3 p-4"
      }
    >
      {({ pressed }) => (
        <>
          <MapPin
            size={18}
            color={colors.textMuted}
            strokeWidth={2}
            accessibilityElementsHidden
            importantForAccessibility="no"
          />
          <View className="min-w-0 flex-1">
            <Text className="text-body-lg font-medium text-text-primary">{address.label}</Text>
            <Text className="text-caption text-text-muted" numberOfLines={2}>
              {address.addressLine}
            </Text>
          </View>
          {address.isDefault ? (
            <Check size={18} color={colors.textPrimary} strokeWidth={2.5} />
          ) : null}
          {pressed ? <View pointerEvents="none" className="gg-pressed absolute inset-0" /> : null}
        </>
      )}
    </Pressable>
  );
}
