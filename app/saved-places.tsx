import { Briefcase, ChevronRight, Home, MapPin, Plus } from "lucide-react-native";
import { useCallback, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";

import { ErrorState } from "@/components/ErrorState";
import { FormScreen } from "@/components/FormScreen";
import { SkeletonBlock } from "@/components/Skeleton";
import { useThemeColors } from "@/hooks/useTheme";
import * as api from "@/lib/api";
import type { ClientAddress } from "@/lib/api";
import { userFacingError } from "@/lib/copy";
import { groupSavedPlaces } from "@/lib/savedPlaces";

/**
 * Saved Places — Grab's Home / Work / named list, GRIDGO chrome.
 *
 * Reached from Account. Tapping a row opens the same editor checkout uses;
 * it does not silently apply a drop-off. There is no trash: live gridgo-api
 * has GET/POST /me/addresses only.
 */
export default function SavedPlacesScreen() {
  const [addresses, setAddresses] = useState<ClientAddress[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setAddresses(await api.listAddresses());
      setError(null);
    } catch (caught) {
      setAddresses([]);
      setError(
        userFacingError(caught, "GRIDGO could not read your saved places. Try again in a moment."),
      );
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const grouped = groupSavedPlaces(addresses ?? []);

  return (
    <FormScreen>
      <View className="gg-page gap-6 pb-16 pt-2">
        <Text className="text-body-lg text-text-secondary">
          GRIDGO prices delivery from these pins. Add Home so the next drop-off is one tap.
        </Text>

        {error ? <ErrorState label="Saved places" body={error} onRetry={() => void load()} /> : null}

        {addresses === null && !error ? (
          <View className="gap-3">
            <SkeletonBlock className="h-16 rounded-card" />
            <SkeletonBlock className="h-16 rounded-card" />
          </View>
        ) : (
          <View className="gap-3">
            {grouped.home ? (
              <PlaceRow
                address={grouped.home}
                icon="home"
                onPress={() =>
                  router.push({ pathname: "/saved-place", params: { addressId: grouped.home!.id } })
                }
              />
            ) : (
              <InviteRow
                title="Add home"
                detail="A pin GRIDGO can come back to"
                icon="home"
                onPress={() => router.push({ pathname: "/saved-place", params: { preset: "home" } })}
              />
            )}
            {grouped.work ? (
              <PlaceRow
                address={grouped.work}
                icon="work"
                onPress={() =>
                  router.push({ pathname: "/saved-place", params: { addressId: grouped.work!.id } })
                }
              />
            ) : (
              <InviteRow
                title="Add work"
                detail="The office, the shop, the stall"
                icon="work"
                onPress={() => router.push({ pathname: "/saved-place", params: { preset: "work" } })}
              />
            )}
          </View>
        )}

        {grouped.named.length ? (
          <View className="gap-3">
            <Text className="text-overline text-text-muted">YOUR PLACES</Text>
            {grouped.named.map((address) => (
              <PlaceRow
                key={address.id}
                address={address}
                icon="named"
                onPress={() =>
                  router.push({ pathname: "/saved-place", params: { addressId: address.id } })
                }
              />
            ))}
          </View>
        ) : null}

        <InviteRow
          title="Add a new place"
          detail="Search, pin, and name it"
          icon="add"
          onPress={() => router.push("/saved-place")}
        />
      </View>
    </FormScreen>
  );
}

function PlaceRow({
  address,
  icon,
  onPress,
}: {
  address: ClientAddress;
  icon: "home" | "work" | "named";
  onPress: () => void;
}) {
  const colors = useThemeColors();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={address.label}
      accessibilityHint="Opens this place so you can confirm the pin and street"
      className="gg-card-flush flex-row items-center gap-3 p-4"
    >
      {({ pressed }) => (
        <>
          <PlaceIcon kind={icon} color={colors.textMuted} />
          <View className="min-w-0 flex-1">
            <Text className="text-body-lg font-medium text-text-primary">{address.label}</Text>
            <Text className="text-caption text-text-muted" numberOfLines={2}>
              {address.addressLine}
            </Text>
          </View>
          <ChevronRight
            size={20}
            color={colors.textMuted}
            accessibilityElementsHidden
            importantForAccessibility="no"
          />
          {pressed ? <View pointerEvents="none" className="gg-pressed absolute inset-0" /> : null}
        </>
      )}
    </Pressable>
  );
}

function InviteRow({
  title,
  detail,
  icon,
  onPress,
}: {
  title: string;
  detail: string;
  icon: "home" | "work" | "add";
  onPress: () => void;
}) {
  const colors = useThemeColors();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={detail}
      className="gg-card-flush flex-row items-center gap-3 p-4"
    >
      {({ pressed }) => (
        <>
          <PlaceIcon kind={icon} color={colors.textPrimary} />
          <View className="min-w-0 flex-1">
            <Text className="text-body-lg font-medium text-text-primary">{title}</Text>
            <Text className="text-caption text-text-muted">{detail}</Text>
          </View>
          <ChevronRight
            size={20}
            color={colors.textMuted}
            accessibilityElementsHidden
            importantForAccessibility="no"
          />
          {pressed ? <View pointerEvents="none" className="gg-pressed absolute inset-0" /> : null}
        </>
      )}
    </Pressable>
  );
}

function PlaceIcon({
  kind,
  color,
}: {
  kind: "home" | "work" | "named" | "add";
  color: string;
}) {
  const props = {
    size: 18,
    color,
    strokeWidth: 2,
    accessibilityElementsHidden: true,
    importantForAccessibility: "no" as const,
  };
  if (kind === "home") return <Home {...props} />;
  if (kind === "work") return <Briefcase {...props} />;
  if (kind === "add") return <Plus {...props} />;
  return <MapPin {...props} />;
}


