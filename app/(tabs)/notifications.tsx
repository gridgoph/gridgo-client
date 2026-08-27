import { useCallback } from "react";
import { ScrollView, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Screen } from "@/components/Screen";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { tabScreenContentPadding } from "@/components/GridgoTabBar";
import { ScreenHeader } from "@/components/ScreenHeader";
import { NotificationCard } from "@/components/NotificationCard";
import { PushEnableCard } from "@/components/PushEnableCard";
import { SecondaryButton } from "@/components/SecondaryButton";
import { SkeletonList } from "@/components/Skeleton";
import { StatusChip } from "@/components/StatusChip";
import { userFacingError } from "@/lib/copy";
import { useThemeColors } from "@/hooks/useTheme";
import { isNotificationRead, useNotifications } from "@/store/notifications";

/**
 * Every update on the client's jobs.
 *
 * The list paints from cache on the first frame. A background refresh then
 * replaces it. Stage rails come from `orderTitle` / `orderState` on the
 * notification itself — this screen does not wait on `GET /orders`.
 */
export default function NotificationsScreen() {
  const colors = useThemeColors();
  const router = useRouter();
  const tabPad = tabScreenContentPadding(useSafeAreaInsets().bottom);
  const { items, loading, error, refresh, readIds, markRead, markAllRead } = useNotifications();

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  const unreadCount = items.filter((item) => !isNotificationRead(item, readIds)).length;

  return (
    <Screen edges={["top"]}>
      <ScrollView className="gg-screen">
        <View className="gg-page gap-4 pt-4" style={{ paddingBottom: tabPad }}>
          <ScreenHeader title="Notifications" />
          {unreadCount > 0 ? (
            <StatusChip tone="info" label={`${unreadCount} unread`} icon="clock" />
          ) : null}

          {/*
            The screen about being told things is where asking to be told them
            needs no explaining, and it is reachable at any time — so a client
            who dismissed the ask elsewhere, or refused it months ago, always
            has a way back. It draws nothing once permission is granted.
          */}
          <PushEnableCard />

          {error ? (
            <ErrorState
              label="Could not load"
              body={userFacingError(
                new Error(error),
                "Could not load your updates. Check your connection and try again.",
              )}
              onRetry={() => void refresh()}
            />
          ) : null}

          {loading && !items.length ? (
            <>
              <Text className="text-body text-text-muted">Loading your updates…</Text>
              <SkeletonList count={3} />
            </>
          ) : null}

          {items.map((notification) => (
            <NotificationCard
              key={notification.id}
              notification={notification}
              read={isNotificationRead(notification, readIds)}
              onOpen={
                notification.orderId
                  ? () => {
                      void markRead(notification.id);
                      router.push(`/order/${notification.orderId}`);
                    }
                  : null
              }
              onMarkRead={() => void markRead(notification.id)}
            />
          ))}

          {unreadCount > 1 ? (
            <SecondaryButton label="Mark all as read" onPress={() => void markAllRead()} />
          ) : null}

          {!items.length && !loading && !error ? (
            <EmptyState
              title="You are all caught up"
              body="When Operations needs your artwork approved, a supplier sets your final price, or your order is out for delivery, the update lands here."
            />
          ) : null}
        </View>
      </ScrollView>
    </Screen>
  );
}
