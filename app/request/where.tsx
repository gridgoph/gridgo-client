import { Check, MapPin } from "lucide-react-native";
import { useCallback, useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import { DropoffDetails } from "@/components/DropoffDetails";
import { DropoffLocator } from "@/components/DropoffLocator";
import { ErrorState } from "@/components/ErrorState";
import { FormScreen } from "@/components/FormScreen";
import { PrimaryButton } from "@/components/PrimaryButton";
import { useDropoffEditor } from "@/hooks/useDropoffEditor";
import { useThemeColors } from "@/hooks/useTheme";
import * as api from "@/lib/api";
import type { ClientAddress, OrderPoint } from "@/lib/api";
import { userFacingError } from "@/lib/copy";
import { prefetchMatch } from "@/lib/matchPrefetch";
import { useCart } from "@/store/cart";
import { useJobDeadline } from "@/store/jobDeadline";

/**
 * Where is this going?
 *
 * Asked before the match when it changes the match: a client who put distance
 * first is asking GRIDGO to pick the nearest press, and the matcher refuses
 * without a drop-off because "nearest" has no meaning until it knows what it is
 * near. Everyone else is asked at checkout instead, where the address is needed
 * for the delivery charge rather than for the choice of shop.
 *
 * Search and Use my location fill the pin GRIDGO prices from so nobody has to
 * hunt Davao by hand. Tapping a saved row still applies the drop-off and
 * continues. Permission is never asked on open.
 */
export default function WhereScreen() {
  const router = useRouter();
  const { subcategory, category, next } = useLocalSearchParams<{
    subcategory?: string;
    category?: string;
    next?: string;
  }>();

  const setDefaultDropoff = useCart((state) => state.setDefaultDropoff);
  const editor = useDropoffEditor();

  const [saved, setSaved] = useState<ClientAddress[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const load = useCallback(() => {
    return api.listAddresses().then((addresses) => {
      setSaved(addresses);
      setLoadError(null);
    }).catch((error) => {
      setSaved([]);
      setLoadError(
        userFacingError(
          error,
          "GRIDGO could not read your saved addresses. You can still set a new one.",
        ),
      );
    });
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /** Put the drop-off on the basket, then carry on where this came from. */
  const applyDropoff = useCallback(
    async (dropoff: OrderPoint) => {
      const cart = await setDefaultDropoff(dropoff);
      const target = next === "checkout" ? "/checkout" : "/request/match";
      if (target === "/request/match" && subcategory) {
        prefetchMatch({
          subcategoryCode: subcategory,
          dropoff,
          deadline: useJobDeadline.getState().by,
          cartId: cart.id,
        });
      }
      router.replace({
        pathname: target,
        params: subcategory ? { subcategory, category: category ?? "" } : {},
      });
    },
    [setDefaultDropoff, router, next, subcategory, category],
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
    editor.setTouched(true);
    if (!editor.ready || !editor.point || busy) return;
    setBusy(true);
    setSaveError(null);
    try {
      const address = await api.saveAddress({
        // An unnamed place is still labelled, so the list can be read next
        // time. GRIDGO caps a label at 80 characters and a composed Davao
        // address can run past that, so it is trimmed rather than refused.
        label: editor.saveLabel,
        addressLine: editor.addressLine,
        point: { ...editor.point, label: editor.addressLine },
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

        <DropoffLocator editor={editor} />

        {editor.notice ? <Text className="text-body text-text-secondary">{editor.notice}</Text> : null}

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

        <DropoffDetails editor={editor} />

        {saveError ? <Text className="text-body text-error">{saveError}</Text> : null}

        <View className="gap-3">
          <PrimaryButton
            label={
              busy ? "Saving…" : next === "checkout" ? "Save this address" : "Find my printer"
            }
            onPress={() => void saveAndGo()}
            disabled={busy}
          />
          {editor.touched && !editor.ready ? (
            <Text className="text-center text-caption text-text-muted">
              {editor.point
                ? "Add the street and number so a rider can find it."
                : "Search, use your location, or tap the map — GRIDGO prices delivery from this pin."}
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
            aria-hidden
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
