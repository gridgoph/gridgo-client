import {
  ArrowRight,
  Award,
  MessageSquare,
  Plus,
  RefreshCw,
  TriangleAlert,
  Truck,
  Upload,
  X,
  type LucideIcon,
} from "lucide-react-native";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Dimensions, Modal, PanResponder, Pressable, Text, View } from "react-native";
import { useRouter, type Href } from "expo-router";
import Animated, {
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ReplaceDraftDialog } from "@/components/ReplaceDraftDialog";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { useReorder } from "@/hooks/useReorder";
import { useThemeColors } from "@/hooks/useTheme";
import * as api from "@/lib/api";
import { foundingTesterView } from "@/lib/foundingTester";
import { bugRewardTag, lastOrder } from "@/lib/homeSummary";
import { quickActions, supportHoursLine, type QuickAction, type QuickActionKey } from "@/lib/quickActions";
import { dragOffset, DISMISS_DISTANCE, SHEET_SPRING, shouldDismissOnRelease } from "@/lib/sheet";
import { startPrintHref } from "@/lib/startPrint";
import { useHomeSummary, useOwnHomeSummary } from "@/store/homeSummary";
import { usePlatformSettings } from "@/store/platformSettings";
import { useQuickActions } from "@/store/quickActions";
import { useSession } from "@/store/session";
import { useSupportChatStore } from "@/store/supportChat";

const ICONS: Record<QuickActionKey, LucideIcon> = {
  start: Plus,
  chat: MessageSquare,
  track: Truck,
  reorder: RefreshCw,
  quote: Upload,
  report: TriangleAlert,
  missions: Award,
};

/** The close disc: the "+" it replaces, in the same place and size. */
export const CLOSE_DISC = 56;

/**
 * The "+" sheet (client#335). Slides up over a dimmed screen from the tab
 * bar's centre button, which becomes a close button while it is open.
 *
 * It closes four ways, and all four run the same slide-out: the close
 * button, a tap on the dim, a swipe down, and Android Back (`Modal`'s
 * `onRequestClose`). The drag uses `PanResponder`, not gesture-handler,
 * because a `Modal` renders outside the gesture root (see `Sheet.tsx`).
 */
export function QuickActionsSheet() {
  const open = useQuickActions((s) => s.open);
  const hide = useQuickActions((s) => s.hide);
  const router = useRouter();
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const user = useSession((s) => s.user);
  const summary = useOwnHomeSummary();
  const chatUnread = useSupportChatStore((s) => s.unreadCount);
  const schedule = usePlatformSettings((s) => s.settings?.operatingHours?.schedule ?? null);
  const { reorder, pendingLabel, confirmReplace, cancelReplace } = useReorder();
  const [orders, setOrders] = useState<api.Order[] | null>(null);

  // Fresh facts each time it opens: the order on the way and the last print
  // change while the client is elsewhere in the app.
  useEffect(() => {
    if (!open) return;
    let live = true;
    void useHomeSummary.getState().load(useSession.getState().user?.id ?? null);
    void usePlatformSettings.getState().load().catch(() => null);
    api
      .listOrders()
      .then((rows) => {
        if (live) setOrders(rows);
      })
      .catch(() => {
        if (live) setOrders((current) => current ?? []);
      });
    return () => {
      live = false;
    };
  }, [open]);

  const tester = foundingTesterView(user);
  // Testers keep the row after earning the label: the screen is where the
  // mission voucher's code lives.
  const missions =
    tester?.kind === "missions"
      ? { done: tester.doneCount, total: tester.steps.length }
      : tester?.kind === "earned"
        ? { done: 5, total: 5 }
        : null;
  const previous = lastOrder(orders ?? []);
  const actions = quickActions({
    startHref: startPrintHref(),
    chatUnread,
    supportLine: supportHoursLine(schedule),
    activeOrderId: summary?.activeOrder?.orderId ?? null,
    reorderTitle: previous?.title ?? null,
    bugReward: bugRewardTag(summary),
    missions,
  });

  // Kept mounted through the slide-out.
  const [closing, setClosing] = useState(false);
  const [prevOpen, setPrevOpen] = useState(open);
  if (prevOpen !== open) {
    setPrevOpen(open);
    if (!open) setClosing(true);
  }
  const screenHeight = Dimensions.get("window").height;
  const translateY = useSharedValue(screenHeight);
  // What a tapped action does once the sheet has slid away.
  const [after, setAfter] = useState<(() => void) | null>(null);

  const finish = useCallback(() => {
    setClosing(false);
    setAfter(null);
    after?.();
  }, [after]);

  // Every way out lowers `open`; the effect below runs the one slide-out.
  const close = useCallback(
    (then?: () => void) => {
      setAfter(() => then ?? null);
      hide();
    },
    [hide],
  );

  useEffect(() => {
    if (open) {
      translateY.set(reducedMotion ? 0 : withSpring(0, SHEET_SPRING));
      return;
    }
    if (!closing) return;
    translateY.set(
      withTiming(screenHeight, { duration: reducedMotion ? 0 : 200 }, (done) => {
        if (done) runOnJS(finish)();
      }),
    );
  }, [open, closing, reducedMotion, translateY, screenHeight, finish]);

  const dragStart = useSharedValue(0);
  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_event, gesture) => Math.abs(gesture.dy) > 4,
        onPanResponderGrant: () => dragStart.set(translateY.get()),
        onPanResponderMove: (_event, gesture) => translateY.set(dragOffset(dragStart.get(), gesture.dy)),
        onPanResponderRelease: (_event, gesture) => {
          if (shouldDismissOnRelease(translateY.get(), gesture.vy)) {
            close();
            return;
          }
          translateY.set(withSpring(0, SHEET_SPRING));
        },
        onPanResponderTerminate: () => translateY.set(withSpring(0, SHEET_SPRING)),
      }),
    [translateY, dragStart, close],
  );

  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: translateY.get() }] }));
  const scrimStyle = useAnimatedStyle(() => ({
    opacity: interpolate(translateY.get(), [0, DISMISS_DISTANCE * 2], [1, 0], Extrapolation.CLAMP),
  }));

  const run = (item: QuickAction) => {
    if (item.disabledReason) return;
    if (item.key === "reorder") {
      if (previous) close(() => void reorder(previous));
      return;
    }
    if (item.href) {
      const href = item.href as Href;
      close(() => router.push(href));
    }
  };

  const byKey = (key: QuickActionKey) => actions.find((item) => item.key === key);
  const start = byKey("start");
  const grid = (["chat", "track", "reorder", "quote"] as const).map(byKey).filter((item): item is QuickAction => Boolean(item));
  const rows = (["report", "missions"] as const).map(byKey).filter((item): item is QuickAction => Boolean(item));

  return (
    <>
      {open || closing ? (
        <Modal visible transparent animationType="none" statusBarTranslucent onRequestClose={() => close()}>
          <View style={{ flex: 1, justifyContent: "flex-end" }}>
            <Animated.View style={[{ ...ABSOLUTE_FILL, backgroundColor: colors.scrim }, scrimStyle]}>
              <Pressable
                testID="quick-actions-scrim"
                accessibilityRole="button"
                accessibilityLabel="Close quick actions"
                onPress={() => close()}
                style={{ flex: 1 }}
              />
            </Animated.View>

            <Animated.View
              testID="quick-actions-sheet"
              accessibilityViewIsModal
              className="rounded-t-card border-t border-outline bg-canvas"
              style={[sheetStyle, { paddingBottom: Math.max(insets.bottom, 12) }]}
            >
              <View {...pan.panHandlers} testID="quick-actions-grabber" className="gg-page pb-3">
                <View className="items-center pb-2 pt-2">
                  <View className="h-1 w-9 rounded-pill bg-outline" />
                </View>
                <Text className="text-overline text-text-muted">QUICK ACTIONS</Text>
                <Text className="text-h2 text-text-primary" accessibilityRole="header">
                  What do you need?
                </Text>
              </View>

              <View className="gg-page gap-3">
                {start ? (
                  <Pressable
                    onPress={() => run(start)}
                    accessibilityRole="button"
                    accessibilityLabel={`${start.title}. ${start.detail}`}
                    className="min-h-16 flex-row items-center gap-3 rounded-card bg-action-yellow px-4 py-3"
                    style={({ pressed }) => (pressed ? { opacity: 0.85 } : undefined)}
                  >
                    {/* Ink on yellow in both themes, like the yellow's own type. */}
                    <View
                      className="h-10 w-10 items-center justify-center rounded-field"
                      style={{ backgroundColor: colors.actionYellowOn }}
                    >
                      <Plus size={22} color={colors.actionYellow} strokeWidth={2.5} />
                    </View>
                    <View className="min-w-0 flex-1">
                      <Text className="text-body-lg font-bold text-action-yellow-on">{start.title}</Text>
                      <Text className="text-caption text-action-yellow-on" numberOfLines={2}>
                        {start.detail}
                      </Text>
                    </View>
                    <ArrowRight size={20} color={colors.actionYellowOn} strokeWidth={2.25} />
                  </Pressable>
                ) : null}

                <View className="flex-row flex-wrap justify-between gap-y-3">
                  {grid.map((item) => (
                    <GridAction key={item.key} item={item} onPress={() => run(item)} />
                  ))}
                </View>

                <View className="gg-card-flush">
                  {rows.map((item, index) => (
                    <View key={item.key}>
                      {index > 0 ? <View className="gg-divider" /> : null}
                      <RowAction item={item} onPress={() => run(item)} />
                    </View>
                  ))}
                </View>
              </View>

              <View className="items-center pt-4">
                <Pressable
                  testID="quick-actions-close"
                  onPress={() => close()}
                  accessibilityRole="button"
                  accessibilityLabel="Close quick actions"
                  className="items-center justify-center rounded-pill bg-accent"
                  style={({ pressed }) => [{ width: CLOSE_DISC, height: CLOSE_DISC }, pressed ? { opacity: 0.8 } : null]}
                >
                  <X size={24} color={colors.accentOn} strokeWidth={2.5} />
                </Pressable>
              </View>
            </Animated.View>
          </View>
        </Modal>
      ) : null}
      <ReplaceDraftDialog label={pendingLabel} onConfirm={confirmReplace} onCancel={cancelReplace} />
    </>
  );
}

function GridAction({ item, onPress }: { item: QuickAction; onPress: () => void }) {
  const colors = useThemeColors();
  const Icon = ICONS[item.key];
  const disabled = item.disabledReason != null;
  return (
    <Pressable
      testID={`quick-action-${item.key}`}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={`${item.title}${item.badge ? `, ${item.badge}` : ""}. ${item.detail}`}
      accessibilityState={{ disabled }}
      className="min-h-24 justify-between rounded-card border border-outline bg-surface p-3"
      style={({ pressed }) => [{ width: "48.5%" }, pressed ? { opacity: 0.75 } : null]}
    >
      <View className="flex-row items-center justify-between">
        <View className={disabled ? "h-8 w-8 items-center justify-center rounded-pill bg-surface-variant gg-disabled" : "h-8 w-8 items-center justify-center rounded-pill bg-surface-variant"}>
          <Icon size={17} color={colors.textPrimary} strokeWidth={2} />
        </View>
        {item.badge ? (
          <View className="rounded-pill bg-accent px-2 py-0.5">
            <Text className="text-caption font-bold text-accent-on">{item.badge}</Text>
          </View>
        ) : null}
      </View>
      <View className="mt-2">
        <Text className={disabled ? "text-body-lg font-bold text-text-muted" : "text-body-lg font-bold text-text-primary"} numberOfLines={1}>
          {item.title}
        </Text>
        <Text className="text-caption text-text-secondary" numberOfLines={2}>
          {item.detail}
        </Text>
      </View>
    </Pressable>
  );
}

function RowAction({ item, onPress }: { item: QuickAction; onPress: () => void }) {
  const colors = useThemeColors();
  const Icon = ICONS[item.key];
  return (
    <Pressable
      testID={`quick-action-${item.key}`}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${item.title}${item.tag ? `, ${item.tag}` : ""}`}
      className="min-h-12 flex-row items-center gap-3 px-4 py-2"
      style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
    >
      <Icon size={18} color={colors.textPrimary} strokeWidth={2} />
      <Text className="flex-1 text-body font-medium text-text-primary" numberOfLines={1}>
        {item.title}
      </Text>
      {item.tag ? (
        <View className="rounded-pill bg-brand px-2 py-0.5">
          <Text className="text-caption font-bold text-action-yellow-on">{item.tag}</Text>
        </View>
      ) : item.key === "missions" ? (
        <Text className="text-body font-bold text-text-primary">{item.detail}</Text>
      ) : null}
    </Pressable>
  );
}

const ABSOLUTE_FILL = { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 } as const;
