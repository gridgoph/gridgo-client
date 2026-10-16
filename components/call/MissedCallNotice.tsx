import { useFocusEffect } from "expo-router";
import { PhoneMissed } from "lucide-react-native";
import { useCallback } from "react";
import { Text, View } from "react-native";

import { SecondaryButton } from "@/components/SecondaryButton";
import { useThemeColors } from "@/hooks/useTheme";
import { callWindowOpen, latestMissedCall, missedCallNotice } from "@/lib/orderCalls";
import { orderCallsOf, useCall } from "@/store/call";

type Props = { order: { id: string; deliveryChat?: unknown } };

/**
 * "Missed call from Sam", with the way to call back.
 *
 * Read from the order's own calls, not from the notification that may have
 * opened this screen: the push carries no call, and a miss stops being news
 * the moment anyone calls again. Reading the calls here is also what rings a
 * call still ringing when a push cold-started the app onto this order.
 */
export function MissedCallNotice({ order }: Props) {
  const colors = useThemeColors();
  const calls = useCall((s) => orderCallsOf(s, order.id));
  const live = useCall((s) => s.session != null && s.session.orderId === order.id && s.session.phase !== "ended");
  const orderId = order.id;

  useFocusEffect(
    useCallback(() => {
      void useCall.getState().refreshOrderCalls(orderId);
    }, [orderId]),
  );

  const missed = latestMissedCall(calls);
  if (!missed || live) return null;
  const notice = missedCallNotice(missed);
  const open = callWindowOpen(order);

  return (
    <View className="gg-card gap-3" accessible={!open} accessibilityLabel={!open ? `${notice.title}. ${notice.detail}` : undefined}>
      <View className="flex-row items-start gap-3">
        <View className="h-10 w-10 items-center justify-center rounded-pill bg-surface-variant">
          <PhoneMissed size={18} color={colors.warning} strokeWidth={2} aria-hidden />
        </View>
        <View className="flex-1 gap-1">
          <Text className="text-body-lg font-medium text-text-primary">{notice.title}</Text>
          <Text className="text-body text-text-secondary">
            {open ? notice.detail : "The delivery is finished, so calls are closed. Message GRIDGO if you need help."}
          </Text>
        </View>
      </View>
      {open ? (
        <SecondaryButton label="Call back" onPress={() => void useCall.getState().startCall(order.id)} />
      ) : null}
    </View>
  );
}
