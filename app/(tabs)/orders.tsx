import { useCallback, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { EmptyState } from "@/components/EmptyState";
import { OrderCard } from "@/components/OrderCard";
import { StatusChip } from "@/components/StatusChip";
import * as api from "@/lib/api";
import { userFacingError } from "@/lib/copy";
import { useThemeColors } from "@/hooks/useTheme";

/**
 * Full client order list with icon+label state chips and money.
 */
export default function OrdersScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const [orders, setOrders] = useState<api.Order[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    return api
      .listOrders()
      .then((list) => {
        setOrders(list);
        setError(null);
      })
      .catch((e) => {
        setOrders([]);
        setError(userFacingError(e, "Could not load orders. Check your connection and try again."));
      });
  }, []);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      void load().then(() => {
        if (!alive) return;
      });
      return () => {
        alive = false;
      };
    }, [load]),
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }} edges={["top"]}>
      <ScrollView className="gg-screen">
        <View className="gg-page gap-4 pb-12 pt-4">
          <Text className="text-h2 text-text-primary">Orders</Text>
          <Text className="text-body text-text-secondary">
            Open a job to approve proofs, pay, or check delivery.
          </Text>

          {error ? (
            <View className="gg-card gap-3">
              <StatusChip tone="error" label="Could not load" icon="circle-x" />
              <Text className="text-body text-error">{error}</Text>
              <Pressable
                onPress={() => void load()}
                accessibilityRole="button"
                className="gg-btn-secondary"
              >
                <Text className="text-button text-text-primary">Try again</Text>
              </Pressable>
            </View>
          ) : null}

          {orders.map((o) => (
            <OrderCard key={o.id} order={o} onPress={() => router.push(`/order/${o.id}`)} />
          ))}

          {!orders.length && !error ? (
            <EmptyState
              title="No print jobs yet"
              body="Choose a product on Home to open a new request."
              actionLabel="Browse catalog"
              onAction={() => router.push("/(tabs)/home")}
            />
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
