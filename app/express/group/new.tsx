import { useFocusEffect, useRouter } from "expo-router";
import { Check, LocateFixed, MapPin, Plus } from "lucide-react-native";
import { useCallback, useState } from "react";
import { Pressable, Text, View } from "react-native";

import { ChoiceChips } from "@/components/express/ExpressChrome";
import { FormField } from "@/components/form/FormField";
import { TextField } from "@/components/form/TextField";
import { FormScreen } from "@/components/FormScreen";
import { useThemeColors } from "@/hooks/useTheme";
import * as api from "@/lib/api";
import { requestCurrentLocation } from "@/lib/deviceLocation";
import { DEFAULT_GROUP_TIME_LIMIT, GROUP_TIME_LIMITS, type GroupTimeLimit } from "@/lib/expressGroup";
import { useExpressGroup } from "@/store/expressGroup";

type Mode = api.FulfilmentMode;
type Place = { lat: number; lng: number; label: string; addressId: string | null };

/** A backup phone the API will take: digits, spaces, brackets, dashes, an optional +. */
function phoneOk(phone: string): boolean {
  return /^\+?[0-9 ()-]{7,24}$/.test(phone.trim());
}

/**
 * Start a group order (gridgo-client#450): how it reaches the group, where,
 * who else may receive it, and how long people have to add files. Nothing is
 * priced or charged here; the shop is chosen at checkout.
 */
export default function NewGroupScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const busy = useExpressGroup((state) => state.busy === "create");
  const error = useExpressGroup((state) => state.error);
  const [mode, setMode] = useState<Mode | null>(null);
  const [place, setPlace] = useState<Place | null>(null);
  const [addresses, setAddresses] = useState<api.ClientAddress[] | null>(null);
  const [locating, setLocating] = useState(false);
  const [locateNote, setLocateNote] = useState<string | null>(null);
  const [limit, setLimit] = useState<GroupTimeLimit>(DEFAULT_GROUP_TIME_LIMIT);
  const [backupName, setBackupName] = useState("");
  const [backupPhone, setBackupPhone] = useState("");
  const [attempted, setAttempted] = useState(false);

  // Saved places are read on focus, so one added from here is offered on return.
  useFocusEffect(
    useCallback(() => {
      useExpressGroup.getState().clearError();
      let alive = true;
      api
        .listAddresses()
        .then((rows) => {
          if (!alive) return;
          setAddresses(rows);
          const saved = rows.find((row) => row.isDefault) ?? rows[0];
          setPlace((current) =>
            current ?? (saved ? { lat: saved.point.lat, lng: saved.point.lng, label: saved.addressLine || saved.label, addressId: saved.id } : null),
          );
        })
        .catch(() => alive && setAddresses([]));
      return () => {
        alive = false;
      };
    }, []),
  );

  const delivery = mode === "delivery";
  const wantsBackup = delivery && (backupName.trim() !== "" || backupPhone.trim() !== "");
  const backupOk = !wantsBackup || (backupName.trim() !== "" && phoneOk(backupPhone));
  const placeOk = place != null && (!delivery || place.addressId != null);
  const blocker = !mode
    ? "Choose pick up or delivery."
    : !placeOk
      ? delivery
        ? "Choose a saved place to deliver to."
        : "Choose where you are, so shops are found near you."
      : !backupOk
        ? "Add the backup's name and a phone number, or leave both empty."
        : null;

  const locateMe = async () => {
    setLocating(true);
    setLocateNote(null);
    const result = await requestCurrentLocation();
    setLocating(false);
    if (result.status !== "ok") {
      setLocateNote(result.message);
      return;
    }
    setPlace({ lat: result.point.lat, lng: result.point.lng, label: "My location", addressId: null });
  };

  const start = async () => {
    setAttempted(true);
    if (blocker || !mode || !place) return;
    const group = await useExpressGroup.getState().create({
      fulfillmentMode: mode,
      location: { lat: place.lat, lng: place.lng },
      ...(delivery ? { dropoff: { lat: place.lat, lng: place.lng, label: place.label } } : {}),
      ...(wantsBackup ? { backupReceiver: { name: backupName.trim(), phone: backupPhone.trim() } } : {}),
      timeLimitMinutes: limit,
    });
    if (group) router.replace({ pathname: "/express/group/[id]", params: { id: group.id, invite: "1" } });
  };

  const message = error ?? (attempted ? blocker : null);
  const footer = (
    <View className="gap-2 border-t border-outline-subtle bg-surface px-4 pb-2 pt-2">
      {message ? (
        <Text className="text-caption text-error" accessibilityRole="alert">
          {message}
        </Text>
      ) : null}
      <Pressable
        onPress={() => void start()}
        // Stays pressable while something is missing, so a press says what.
        disabled={busy}
        accessibilityRole="button"
        accessibilityHint={blocker ?? undefined}
        className={busy || blocker ? "gg-btn-primary gg-disabled" : "gg-btn-primary"}
      >
        <Text className="text-button text-action-yellow-on">{busy ? "Starting…" : "Start group"}</Text>
      </Pressable>
    </View>
  );

  return (
    <FormScreen footer={footer} contentContainerStyle={{ padding: 16, gap: 20, paddingBottom: 24 }}>
      <Text className="text-body text-text-secondary">
        Everyone adds their own files. You pay GRIDGO once, and each person pays you back their share.
      </Text>

      <View className="gap-2">
        <Text className="text-body font-bold text-text-primary">How does the group get it?</Text>
        <ChoiceChips
          label="How does the group get it"
          options={[
            { value: "pickup", label: "Pick up", detail: "You collect it all" },
            { value: "delivery", label: "Deliver", detail: "To your address" },
          ]}
          value={(mode ?? "") as Mode}
          onChange={setMode}
        />
      </View>

      {mode ? (
        <View className="gap-2">
          <Text className="text-body font-bold text-text-primary">{delivery ? "Deliver to" : "Find shops near"}</Text>
          {mode === "pickup" ? (
            <Pressable
              onPress={() => void locateMe()}
              disabled={locating}
              accessibilityRole="radio"
              accessibilityState={{ selected: place != null && place.addressId == null }}
              className="min-h-12 flex-row items-center gap-3 rounded-card border border-outline bg-surface px-3"
            >
              <LocateFixed size={20} color={colors.textPrimary} strokeWidth={2} aria-hidden />
              <Text className="min-w-0 flex-1 text-body font-medium text-text-primary">{locating ? "Finding you…" : "Use my location"}</Text>
              {place && !place.addressId ? <Check size={18} color={colors.textPrimary} strokeWidth={2.5} aria-hidden /> : null}
            </Pressable>
          ) : null}
          {locateNote ? <Text className="text-caption text-error">{locateNote}</Text> : null}
          {(addresses ?? []).map((address) => {
            const chosen = place?.addressId === address.id;
            return (
              <Pressable
                key={address.id}
                onPress={() =>
                  setPlace({ lat: address.point.lat, lng: address.point.lng, label: address.addressLine || address.label, addressId: address.id })
                }
                accessibilityRole="radio"
                accessibilityState={{ selected: chosen }}
                className="min-h-12 flex-row items-center gap-3 rounded-card border border-outline bg-surface px-3 py-2"
              >
                <MapPin size={20} color={colors.textSecondary} strokeWidth={2} aria-hidden />
                <View className="min-w-0 flex-1">
                  <Text className="text-body font-medium text-text-primary" numberOfLines={1}>
                    {address.label}
                  </Text>
                  <Text className="text-caption text-text-muted" numberOfLines={1}>
                    {address.addressLine}
                  </Text>
                </View>
                {chosen ? <Check size={18} color={colors.textPrimary} strokeWidth={2.5} aria-hidden /> : null}
              </Pressable>
            );
          })}
          <Pressable
            onPress={() => router.push("/saved-place")}
            accessibilityRole="button"
            className="min-h-11 flex-row items-center gap-3 px-3"
          >
            <Plus size={20} color={colors.textPrimary} strokeWidth={2} aria-hidden />
            <Text className="text-body font-medium text-text-primary">Add a place</Text>
          </Pressable>
        </View>
      ) : null}

      {delivery ? (
        <View className="gap-3">
          <View className="gap-0.5">
            <Text className="text-body font-bold text-text-primary">Backup receiver</Text>
            <Text className="text-caption text-text-muted">Optional. Someone the rider may hand it to if you do not answer.</Text>
          </View>
          <FormField label="Name" optional>
            <TextField value={backupName} onChangeText={(next) => setBackupName(next.slice(0, 100))} placeholder="Their name" accessibilityLabel="Backup name" maxLength={100} />
          </FormField>
          <FormField
            label="Phone"
            optional
            error={attempted && wantsBackup && !phoneOk(backupPhone) ? "Enter a phone number, e.g. 0917 123 4567." : null}
          >
            <TextField
              value={backupPhone}
              onChangeText={setBackupPhone}
              placeholder="0917 123 4567"
              accessibilityLabel="Backup phone"
              keyboardType="phone-pad"
              maxLength={24}
            />
          </FormField>
        </View>
      ) : null}

      <View className="gap-2">
        <Text className="text-body font-bold text-text-primary">Time to add files</Text>
        <ChoiceChips
          label="Time to add files"
          options={GROUP_TIME_LIMITS.map((minutes) => ({ value: String(minutes), label: `${minutes} min` }))}
          value={String(limit)}
          onChange={(next) => setLimit(Number(next) as GroupTimeLimit)}
        />
        <Text className="text-caption text-text-muted">When time is up, checkout opens for you. Nobody is charged until you pay.</Text>
      </View>

      <View className="gap-2">
        <Text className="text-body font-bold text-text-primary">Who pays</Text>
        <View className="gg-card-flush">
          <View className="min-h-14 flex-row items-center gap-3 px-4 py-2.5" accessibilityRole="radio" accessibilityState={{ selected: true }} accessible>
            <View className="h-5 w-5 items-center justify-center rounded-pill border-2 border-accent">
              <View className="h-2.5 w-2.5 rounded-pill bg-accent" />
            </View>
            <View className="min-w-0 flex-1">
              <Text className="text-body font-medium text-text-primary">You pay, everyone pays you back</Text>
              <Text className="text-caption text-text-secondary">In cash or by e-wallet, outside the app. Each person sees what they owe you.</Text>
            </View>
          </View>
          <View
            className="min-h-14 flex-row items-center gap-3 border-t border-outline-subtle px-4 py-2.5"
            accessible
            accessibilityRole="radio"
            accessibilityState={{ selected: false, disabled: true }}
            accessibilityLabel="Split in the app. Coming soon"
            style={{ opacity: 0.5 }}
          >
            <View className="h-5 w-5 rounded-pill border-2 border-outline" />
            <Text className="min-w-0 flex-1 text-body text-text-secondary">Split in the app</Text>
            <Text className="text-caption text-text-muted">Coming soon</Text>
          </View>
        </View>
      </View>
    </FormScreen>
  );
}
