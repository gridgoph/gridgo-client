import { useLiveRefresh } from "@/hooks/useLiveRefresh";
import { useCallback } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppUpdateNotices } from "@/components/AppUpdateNotices";
import { TabScreen } from "@/components/TabScreen";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { tabScreenContentPadding } from "@/components/GridgoTabBar";
import { ScreenHeader } from "@/components/ScreenHeader";
import { NotificationCard } from "@/components/NotificationCard";
import { PushEnableCard } from "@/components/PushEnableCard";
import { SkeletonList } from "@/components/Skeleton";
import { userFacingError } from "@/lib/copy";
import {
  isGroupUnread,
  partitionInbox,
  type NotificationGroup,
} from "@/lib/notificationPresentation";
import {
  countUnreadGroups,
  isNotificationRead,
  useNotifications,
} from "@/store/notifications";

/**
 * Every update on the client's jobs.
 *
 * The list paints from cache on the first frame. A background refresh then
 * replaces it. Stage rails come from `orderTitle` / `orderState` /
 * `fulfillmentMode` on the notification itself — this screen does not wait
 * on `GET /orders`.
 *
 * One card per job (`groupInbox`): the API keeps a row per order step, and a
 * card per row buried the inbox under one job's history. Unread, the count
 * and the lane all follow the job's newest row; opening or swiping a card
 * marks every row in it read.
 */
export default function NotificationsScreen() {
  const router = useRouter();
  const tabPad = tabScreenContentPadding(useSafeAreaInsets().bottom);
  const { items, loading, error, refresh, readIds, markManyRead, markAllRead } =
    useNotifications();

  useLiveRefresh(["notifications"], refresh, { refreshOnFocus: false });

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  const unreadCount = countUnreadGroups(items, readIds);
  const { needYou, updates } = partitionInbox(items);
  const splitInbox = needYou.length > 0 && updates.length > 0;

  function renderRow(group: NotificationGroup) {
    const notification = group.latest;
    const markGroupRead = () => void markManyRead(group.items.map((item) => item.id));
    return (
      <NotificationCard
        key={group.key}
        group={group}
        read={!isGroupUnread(group, (item) => isNotificationRead(item, readIds))}
        onOpen={
          notification.orderId
            ? () => {
                markGroupRead();
                if (notification.type === "order_receipt_ready") {
                  router.push({
                    pathname: "/order/receipt",
                    params: { orderId: notification.orderId },
                  });
                  return;
                }
                router.push(`/order/${notification.orderId}`);
              }
            : null
        }
        onMarkRead={markGroupRead}
      />
    );
  }

  return (
    <TabScreen>
      <ScrollView className="gg-screen">
        <View className="gg-page gap-4 pt-4" style={{ paddingBottom: tabPad }}>
          <ScreenHeader title="Notifications" />
          {/*
            App updates, pinned above the jobs. Local to this phone: they are not
            in the unread line or the list below, which both belong to jobs.
          */}
          <AppUpdateNotices />
          {/*
            How many cards are new, and the way to clear them, on one line. It
            was a blue clock pill up here and a full-width button at the foot
            of the list: a clock says "waiting", which unread is not, and the
            button sat below every card it would clear. The ink tick is the
            unread spine's colour, so the count and the cards read as one fact.
          */}
          {unreadCount > 0 ? (
            <View className="min-h-11 flex-row items-center gap-2">
              <View className="h-3 w-[3px] rounded-pill bg-accent" aria-hidden />
              <Text className="flex-1 text-body font-medium text-text-primary">
                {`${unreadCount} unread`}
              </Text>
              {unreadCount > 1 ? (
                <Pressable
                  onPress={() => void markAllRead()}
                  accessibilityRole="button"
                  accessibilityLabel="Mark all as read"
                  className="gg-touch justify-center"
                  style={({ pressed }) => (pressed ? { opacity: 0.6 } : undefined)}
                >
                  <Text className="text-button text-text-primary">Mark all as read</Text>
                </Pressable>
              ) : null}
            </View>
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

          {needYou.length ? (
            <View className="gap-3">
              <SectionHead label="NEEDS YOU" count={needYou.length} />
              {needYou.map(renderRow)}
            </View>
          ) : null}

          {updates.length ? (
            <View className="gap-3">
              {splitInbox ? <SectionHead label="UPDATES" /> : null}
              {updates.map(renderRow)}
            </View>
          ) : null}

          {!items.length && !loading && !error ? (
            <EmptyState
              title="You are all caught up"
              body="When Operations needs your artwork, a job is ready at the GRIDGO Office counter, or a rider is bringing one to your door, the update lands here."
            />
          ) : null}
        </View>
      </ScrollView>
    </TabScreen>
  );
}

/** Home's section head: a quiet overline, and a count where the number is the point. */
function SectionHead({ label, count }: { label: string; count?: number }) {
  return (
    <View className="mt-2 flex-row items-center gap-2">
      <Text className="text-overline text-text-muted">{label}</Text>
      {count != null && count > 0 ? (
        <View className="rounded-pill border border-outline bg-surface px-2 py-0.5">
          <Text className="text-caption text-text-secondary">{count}</Text>
        </View>
      ) : null}
    </View>
  );
}
