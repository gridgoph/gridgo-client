import { ChevronLeft } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";

import { EmptyState } from "@/components/EmptyState";
import { Screen } from "@/components/Screen";
import { ShopChatConversation } from "@/components/ShopChatConversation";
import { useThemeColors } from "@/hooks/useTheme";

/**
 * The masked conversation with the print shop on one order (gridgo-client#246).
 * Opened from the order screen or a message notice; `lib/shopChat.ts` holds the
 * rules and the words.
 */
export default function ShopChatScreen() {
  const { orderId } = useLocalSearchParams<{ orderId?: string }>();
  const router = useRouter();
  const colors = useThemeColors();

  const openOrder = () => {
    if (router.canGoBack()) router.back();
    else if (orderId) router.replace(`/order/${orderId}`);
    else router.replace("/(tabs)/orders");
  };

  // Reached by a deep link there is nothing behind it to go back to.
  const headerEscape = !router.canGoBack() ? (
    <Stack.Screen
      options={{
        headerLeft: () => (
          <Pressable
            onPress={openOrder}
            accessibilityRole="button"
            accessibilityLabel="Back to the order"
            hitSlop={12}
            className="flex-row items-center gap-1 pr-3"
          >
            <ChevronLeft size={24} color={colors.textPrimary} strokeWidth={2} />
            <Text className="text-body-lg text-text-primary">Order</Text>
          </Pressable>
        ),
      }}
    />
  ) : null;

  if (!orderId) {
    return (
      <Screen edges={["bottom"]}>
        {headerEscape}
        <View className="gg-page pt-6">
          <EmptyState
            title="No order chosen"
            body="Open an order to message its print shop."
            actionLabel="Open Orders"
            onAction={openOrder}
          />
        </View>
      </Screen>
    );
  }

  return (
    <>
      {headerEscape}
      <ShopChatConversation orderId={orderId} onOpenOrder={openOrder} />
    </>
  );
}
