import { useCallback, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { tabScreenContentPadding } from "@/components/GridgoTabBar";
import { NotificationCard } from "@/components/NotificationCard";
import { SecondaryButton } from "@/components/SecondaryButton";
import { SkeletonList } from "@/components/Skeleton";
import { StatusChip } from "@/components/StatusChip";
import * as api from "@/lib/api";
import { userFacingError } from "@/lib/copy";
import { useThemeColors } from "@/hooks/useTheme";
import { isNotificationRead, useNotifications } from "@/store/notifications";

/**
 * Every update on the client's jobs.
 *
 * Modelled on the legacy GRIDGO notification list, which did one thing this
 * app did not: it showed where the job had actually got to, on the row itself.
 * The order behind each update is fetched alongside the list so a row can draw
 * that stage rail from the job's real state rather than from the wording of
 * the message.
 *
 * A row with no job behind it — an update about the account, or one whose job
 * this client can no longer see — simply has no rail. Nothing is invented.
 */
export default function NotificationsScreen() {
  const colors = useThemeColors();
  const router = useRouter();
  const tabPad = tabScreenContentPadding(useSafeAreaInsets().bottom);
  const { items, loading, error, refresh, readIds, markRead, markAllRead } = useNotifications();
  const [orders, setOrders] = useState<api.Order[]>([]);

  const load = useCallback(async () => {
    await refresh();
    // The rail is an enrichment, not the content: a failure here costs the
    // stage line and nothing else, so the list still renders.
    try {
      setOrders(await api.listOrders());
    } catch {
      setOrders([]);
    }
  }, [refresh]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const orderById = new Map(orders.map((order) => [order.id, order]));
  const unreadCount = items.filter((item) => !isNotificationRead(item, readIds)).length;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }} edges={["top"]}>
      <ScrollView className="gg-screen">
        <View className="gg-page gap-4 pt-4" style={{ paddingBottom: tabPad }}>
          <View className="flex-row items-center justify-between gap-3">
            <Text className="text-h1 text-text-primary">Notifications</Text>
            {unreadCount > 0 ? (
              <StatusChip tone="info" label={`${unreadCount} unread`} icon="clock" />
            ) : null}
          </View>
          <Text className="text-body text-text-secondary">
            {unreadCount > 0
              ? "Tap an update to open the job, or swipe it left to mark it read."
              : "Deadlines and status changes for your print jobs."}
          </Text>

          {error ? (
            <ErrorState
              label="Could not load"
              body={userFacingError(
                new Error(error),
                "Could not load your updates. Check your connection and try again.",
              )}
              onRetry={() => void load()}
            />
          ) : null}

          {loading && !items.length ? (
            <>
              <Text className="text-body text-text-muted">Loading your updates…</Text>
              <SkeletonList count={3} />
            </>
          ) : null}

          {items.map((notification) => {
            const order = notification.orderId
              ? (orderById.get(notification.orderId) ?? null)
              : null;
            return (
              <NotificationCard
                key={notification.id}
                notification={notification}
                read={isNotificationRead(notification, readIds)}
                order={order}
                onOpen={
                  order
                    ? () => {
                        markRead(notification.id);
                        router.push(`/order/${order.id}`);
                      }
                    : null
                }
                onMarkRead={() => markRead(notification.id)}
              />
            );
          })}

          {unreadCount > 1 ? (
            <SecondaryButton label="Mark all as read" onPress={markAllRead} />
          ) : null}

          {!items.length && !loading && !error ? (
            <EmptyState
              title="You are all caught up"
              body="When Operations needs your artwork approved, a supplier sets your final price, or your order is out for delivery, the update lands here."
            />
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
