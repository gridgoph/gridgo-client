import { useCallback, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { EmptyState } from "@/components/EmptyState";
import { OrderCard } from "@/components/OrderCard";
import { StatusChip } from "@/components/StatusChip";
import * as api from "@/lib/api";
import { useThemeColors } from "@/hooks/useTheme";

/**
 * Full client order list with icon+label state chips and money.
 */
export default function OrdersScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const [orders, setOrders] = useState<api.Order[]>([]);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      void api
        .listOrders()
        .then((list) => {
          if (!alive) return;
          setOrders(list);
          setError(null);
        })
        .catch((e) => {
          if (!alive) return;
          setOrders([]);
          setError(e instanceof Error ? e.message : "Failed to load orders");
        });
      return () => {
        alive = false;
      };
    }, []),
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }} edges={["top"]}>
      <ScrollView className="gg-screen">
        <View className="gg-page gap-4 pb-12 pt-4">
        <Text className="text-h2 text-text-primary">Orders</Text>
        <Text className="text-body text-text-secondary">
          Track QA, payment, production, and delivery for each print job.
        </Text>

        {error ? (
          <View className="gg-card gap-2">
            <StatusChip tone="error" label="Load failed" icon="circle-x" />
            <Text className="text-body text-error">{error}</Text>
          </View>
        ) : null}

        {orders.map((o) => (
          <OrderCard key={o.id} order={o} onPress={() => router.push(`/order/${o.id}`)} />
        ))}

        {!orders.length && !error ? (
          <EmptyState
            title="No orders yet"
            body="Start from the catalog on Home or the New Request tab."
          />
        ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
