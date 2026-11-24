import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { ChevronLeft, Clock, Lock, Users } from "lucide-react-native";
import { useCallback, useEffect } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

import { Screen } from "@/components/Screen";
import { SkeletonBlock, SkeletonLine } from "@/components/Skeleton";
import { useThemeColors } from "@/hooks/useTheme";
import { useServerNow } from "@/hooks/useVoucherClock";
import { clockTime, firstName, initials, modeLine, peopleLine, timeLeft } from "@/lib/expressGroup";
import { useExpressGroup } from "@/store/expressGroup";
import { usePendingGroupInvite } from "@/store/pendingGroupInvite";

/**
 * An invite link, opened (gridgo-client#450). Who invited you, what it is
 * for, how long is left, then one button. A full, closed, checked-out or
 * cancelled group says so in one calm line.
 */
export default function JoinGroupScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const { token } = useLocalSearchParams<{ token: string }>();
  const busy = useExpressGroup((state) => state.busy === "join");
  const error = useExpressGroup((state) => state.error);
  const now = useServerNow(1000);
  const read = useExpressGroup((state) => (state.invite?.token === token ? state.invite : null)) ?? { status: "loading" as const };
  const load = useCallback(() => {
    if (token) void useExpressGroup.getState().readInvite(token);
  }, [token]);

  useEffect(load, [load]);
  // This is the invite a signed-out link was holding; it has been opened.
  useEffect(() => {
    if (token && usePendingGroupInvite.getState().token === token) usePendingGroupInvite.getState().clear();
  }, [token]);

  // Already in this group: straight to it.
  const memberOf = read.status === "member" ? read.groupId : null;
  useEffect(() => {
    if (memberOf) router.replace({ pathname: "/express/group/[id]", params: { id: memberOf } });
  }, [memberOf, router]);

  const join = async () => {
    if (!token) return;
    const group = await useExpressGroup.getState().join(token);
    if (group) router.replace({ pathname: "/express/group/[id]", params: { id: group.id } });
  };

  const headerEscape = !router.canGoBack() ? (
    <Stack.Screen
      options={{
        headerLeft: () => (
          <Pressable
            onPress={() => router.replace("/(tabs)/home")}
            accessibilityRole="button"
            accessibilityLabel="Back to Home"
            hitSlop={12}
            className="flex-row items-center gap-1 pr-3"
          >
            <ChevronLeft size={24} color={colors.textPrimary} strokeWidth={2} />
            <Text className="text-body-lg text-text-primary">Home</Text>
          </Pressable>
        ),
      }}
    />
  ) : null;

  if (read.status === "loading" || read.status === "member") {
    return (
      <Screen edges={["bottom"]}>
        {headerEscape}
        <View className="gg-page gap-3 pt-6" accessibilityRole="progressbar" accessibilityLabel="Opening the invite">
          <SkeletonBlock className="h-48" />
          <SkeletonLine width="w-2/3" height="h-6" />
        </View>
      </Screen>
    );
  }

  if (read.status !== "ready") {
    const closed = read.status === "closed";
    return (
      <Screen edges={["bottom"]}>
        {headerEscape}
        <View className="gg-page gap-4 pt-10">
          <View className="items-center gap-3 px-4">
            <View className="h-14 w-14 items-center justify-center rounded-pill bg-surface-variant">
              <Lock size={24} color={colors.textSecondary} strokeWidth={2} aria-hidden />
            </View>
            <Text className="text-center text-h3 font-bold text-text-primary">{closed ? "This group is closed" : "Invite not opened"}</Text>
            <Text className="text-center text-body text-text-secondary">{read.message}</Text>
          </View>
          {closed ? (
            <Pressable onPress={() => router.replace("/express")} accessibilityRole="button" className="gg-btn-secondary">
              <Text className="text-button text-text-primary">Print on your own</Text>
            </Pressable>
          ) : (
            <Pressable onPress={() => load()} accessibilityRole="button" className="gg-btn-secondary">
              <Text className="text-button text-text-primary">Try again</Text>
            </Pressable>
          )}
        </View>
      </Screen>
    );
  }

  const invite = read.invite;
  const left = timeLeft(invite.closesAt, now);
  const host = firstName(invite.hostName);
  const footer = (
    <View className="gap-2 border-t border-outline-subtle bg-surface px-4 pb-2 pt-2">
      {error ? (
        <Text className="text-caption text-error" accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
      <Pressable
        onPress={() => void join()}
        disabled={busy || !left}
        accessibilityRole="button"
        accessibilityState={{ disabled: busy || !left }}
        className={busy || !left ? "gg-btn-primary gg-disabled" : "gg-btn-primary"}
      >
        <Text className="text-button text-action-yellow-on">{busy ? "Joining…" : left ? `Join ${host}'s group` : "This group has closed"}</Text>
      </Pressable>
    </View>
  );

  return (
    <Screen edges={["bottom"]}>
      {headerEscape}
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
        <View className="gg-card items-center gap-3 py-6">
          <View className="h-16 w-16 items-center justify-center rounded-pill bg-accent">
            <Text className="text-h2 font-bold text-accent-on">{initials(invite.hostName)}</Text>
          </View>
          <View className="items-center gap-1">
            <Text className="text-center text-h2 font-bold text-text-primary">{host} invited you</Text>
            <Text className="text-center text-body text-text-secondary">
              to print together. Add your files, pay {host} back your share, and split one {invite.fulfillmentMode === "delivery" ? "delivery fee" : "pickup"}.
            </Text>
          </View>
          <View className="items-center pt-1" accessible accessibilityLabel={left ? `${left} left to add files` : "Closed"}>
            <Text className="font-bold text-text-primary" style={{ fontSize: 36, lineHeight: 42, fontVariant: ["tabular-nums"] }}>
              {left ?? "0:00"}
            </Text>
            <Text className="text-caption text-text-muted">left to add files</Text>
          </View>
        </View>
        <View className="gg-card-flush">
          <View className="min-h-12 flex-row items-center gap-3 px-4 py-2.5">
            <Users size={18} color={colors.textSecondary} strokeWidth={2} aria-hidden />
            <Text className="min-w-0 flex-1 text-body text-text-primary">{peopleLine(invite.people)} in so far</Text>
          </View>
          <View className="min-h-12 flex-row items-center gap-3 border-t border-outline-subtle px-4 py-2.5">
            <Clock size={18} color={colors.textSecondary} strokeWidth={2} aria-hidden />
            <Text className="min-w-0 flex-1 text-body text-text-primary">Files close at {clockTime(invite.closesAt) ?? "—"}</Text>
          </View>
          <View className="min-h-12 flex-row items-center gap-3 border-t border-outline-subtle px-4 py-2.5">
            <Lock size={18} color={colors.textSecondary} strokeWidth={2} aria-hidden />
            <Text className="min-w-0 flex-1 text-body text-text-primary">
              {modeLine(invite.fulfillmentMode)}. Your files stay private; {host} cannot open them.
            </Text>
          </View>
        </View>
        <Text className="text-caption text-text-muted">
          You see what you owe before anything is ordered. GRIDGO never charges you; {host} pays for the group.
        </Text>
      </ScrollView>
      {footer}
    </Screen>
  );
}
