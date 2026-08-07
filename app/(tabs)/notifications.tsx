import { useCallback } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { EmptyState } from "@/components/EmptyState";
import { StatusChip } from "@/components/StatusChip";
import { userFacingError } from "@/lib/copy";
import { formatRelativeTime } from "@/lib/relativeTime";
import { useThemeColors } from "@/hooks/useTheme";
import { useNotifications } from "@/store/notifications";

/**
 * In-app notification list.
 * Unread rows are emphasized; count is also shown on the tab bar.
 */
export default function NotificationsScreen() {
  const colors = useThemeColors();
  const { items, loading, error, refresh, unreadCount } = useNotifications();

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }} edges={["top"]}>
      <ScrollView className="gg-screen">
        <View className="gg-page gap-4 pb-12 pt-4">
          <View className="flex-row items-center justify-between gap-3">
            <Text className="text-h2 text-text-primary">Notifications</Text>
            {unreadCount > 0 ? (
              <StatusChip tone="info" label={`${unreadCount} unread`} icon="clock" />
            ) : null}
          </View>
          <Text className="text-body text-text-secondary">
            Deadlines and status changes for your print jobs.
          </Text>

          {error ? (
            <View className="gg-card gap-3">
              <StatusChip tone="error" label="Could not load" icon="circle-x" />
              <Text className="text-body text-error">
                {userFacingError(new Error(error), "Could not load notifications. Try again.")}
              </Text>
              <Pressable
                onPress={() => void refresh()}
                accessibilityRole="button"
                className="gg-btn-secondary"
              >
                <Text className="text-button text-text-primary">Try again</Text>
              </Pressable>
            </View>
          ) : null}

          {loading && !items.length ? (
            <Text className="text-body text-text-muted">Loading…</Text>
          ) : null}

          {items.map((n) => (
            <View
              key={n.id}
              className={
                n.read
                  ? "gg-card"
                  : "rounded-card border border-outline bg-surface-high p-4"
              }
            >
              <View className="flex-row items-start justify-between gap-3">
                <Text
                  className={
                    n.read
                      ? "flex-1 text-body-lg text-text-primary"
                      : "flex-1 text-body-lg font-medium text-text-primary"
                  }
                >
                  {n.title}
                </Text>
                {!n.read ? (
                  <StatusChip tone="info" label="Unread" icon="clock" />
                ) : null}
              </View>
              <Text className="mt-2 text-body text-text-secondary">{n.body}</Text>
              <Text className="mt-2 text-caption text-text-muted">
                {formatRelativeTime(n.at)}
              </Text>
            </View>
          ))}

          {!items.length && !loading && !error ? (
            <EmptyState
              title="You are all caught up"
              body="When a job needs proof approval, payment, or is out for delivery, the update lands here."
            />
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
