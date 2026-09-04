import { useCallback, useEffect, useState } from "react";
import { Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import { DropoffDetails } from "@/components/DropoffDetails";
import { DropoffLocator } from "@/components/DropoffLocator";
import { FormScreen } from "@/components/FormScreen";
import { PrimaryButton } from "@/components/PrimaryButton";
import { useDropoffEditor } from "@/hooks/useDropoffEditor";
import * as api from "@/lib/api";
import { parseAddress } from "@/lib/address";
import { userFacingError } from "@/lib/copy";
import { HOME_LABEL, isHomeLabel, isWorkLabel, WORK_LABEL } from "@/lib/savedPlaces";

/**
 * Add or confirm a saved place. Same editor as Where is it going?, without
 * applying the pin to a basket — Account is not checkout.
 */
export default function SavedPlaceScreen() {
  const router = useRouter();
  const { preset, addressId } = useLocalSearchParams<{
    preset?: string;
    addressId?: string;
  }>();

  const lockedLabel =
    preset === "home" ? HOME_LABEL : preset === "work" ? WORK_LABEL : "";
  const editor = useDropoffEditor({
    initialLabel: lockedLabel,
    skipPrePin: Boolean(addressId),
  });

  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [loadedId, setLoadedId] = useState<string | null>(null);

  useEffect(() => {
    if (!addressId) return;
    let cancelled = false;
    void api.listAddresses().then((addresses) => {
      if (cancelled) return;
      const existing = addresses.find((row) => row.id === addressId);
      if (!existing) return;
      const parts = parseAddress(existing.addressLine);
      editor.loadSaved({
        label: existing.label,
        line1: parts.line1,
        landmark: parts.landmark,
        point: { lat: existing.point.lat, lng: existing.point.lng },
      });
      setLoadedId(existing.id);
    });
    return () => {
      cancelled = true;
    };
    // Load once per id; the editor object is stable enough for this screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addressId]);

  const heading = lockedLabel
    ? `Add ${lockedLabel.toLowerCase()}`
    : loadedId
      ? editor.label.trim() || "Saved place"
      : "Add a place";

  const save = useCallback(async () => {
    editor.setTouched(true);
    if (!editor.ready || !editor.point || busy) return;
    setBusy(true);
    setSaveError(null);
    const label = lockedLabel || editor.saveLabel;
    try {
      const existing = loadedId ? (await api.listAddresses()).find((row) => row.id === loadedId) : null;
      const unchanged =
        existing &&
        existing.addressLine === editor.addressLine &&
        existing.point.lat === editor.point.lat &&
        existing.point.lng === editor.point.lng &&
        existing.label === label;
      if (!unchanged) {
        await api.saveAddress({
          label,
          addressLine: editor.addressLine,
          point: { ...editor.point, label: editor.addressLine },
          isDefault: false,
        });
      }
      router.back();
    } catch (error) {
      setSaveError(
        userFacingError(error, "GRIDGO could not save that address. Try again in a moment."),
      );
      setBusy(false);
    }
  }, [busy, editor, loadedId, lockedLabel, router]);

  const labelLocked = Boolean(lockedLabel) || (loadedId ? isHomeLabel(editor.label) || isWorkLabel(editor.label) : false);

  return (
    <FormScreen>
      <View className="gg-page gap-8 pb-16 pt-2">
        <View className="gap-3">
          <Text className="text-h1 text-text-primary">{heading}</Text>
          <Text className="text-body-lg text-text-secondary">
            Search, use your location, or tap the map. GRIDGO prices delivery from this pin.
          </Text>
        </View>

        <DropoffLocator editor={editor} />
        <DropoffDetails
          editor={editor}
          labelLocked={labelLocked}
          namePlaceholder={lockedLabel || "Shop"}
        />

        {editor.notice ? <Text className="text-body text-text-secondary">{editor.notice}</Text> : null}
        {saveError ? <Text className="text-body text-error">{saveError}</Text> : null}

        <View className="gap-3">
          <PrimaryButton
            label={busy ? "Saving…" : "Save this address"}
            onPress={() => void save()}
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
