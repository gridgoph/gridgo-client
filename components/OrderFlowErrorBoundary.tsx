import { useRouter, type ErrorBoundaryProps } from "expo-router";
import { useEffect } from "react";
import { Text, View } from "react-native";

import { PrimaryButton } from "@/components/PrimaryButton";
import { Screen } from "@/components/Screen";
import { SecondaryButton } from "@/components/SecondaryButton";
import { StatusChip } from "@/components/StatusChip";
import { HOME_TAB } from "@/lib/receipt";

export const ORDER_FLOW_CRASH_TITLE = "Something went wrong";
export const ORDER_FLOW_CRASH_BODY =
  "GRIDGO hit a problem on this step. Your order is still saved. Try again, or go back to Home.";

/**
 * What an order-flow screen shows when it throws while drawing.
 *
 * Each `app/request/*` route exports this as its Expo Router `ErrorBoundary`,
 * so a render error on one step replaces that step with this screen instead
 * of closing the app — a phone build has no other boundary. It is
 * containment, not a fix: the error's own message is printed under the copy,
 * so a screenshot names the cause, and it goes to `console.error`, which
 * lands in the Android device log.
 *
 * Nothing here touches the basket. It lives on GRIDGO and only its id is on
 * the phone, so "Go back to Home" leaves it exactly as it was.
 */
export function OrderFlowErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  const router = useRouter();

  useEffect(() => {
    console.error("[order-flow] a step crashed while drawing:", error);
  }, [error]);

  const detail = error?.message?.trim() || String(error);

  return (
    <Screen edges={["bottom"]}>
      <View className="gg-page gap-4 pt-6">
        <View className="gg-card gap-3" accessible accessibilityRole="alert">
          <StatusChip tone="error" label={ORDER_FLOW_CRASH_TITLE} icon="circle-x" />
          <Text className="text-body text-text-primary">{ORDER_FLOW_CRASH_BODY}</Text>
          <Text className="text-caption text-text-muted" selectable>
            {detail}
          </Text>
        </View>
        <PrimaryButton label="Try again" onPress={() => void retry()} />
        <SecondaryButton label="Go back to Home" onPress={() => router.dismissTo(HOME_TAB)} />
      </View>
    </Screen>
  );
}
