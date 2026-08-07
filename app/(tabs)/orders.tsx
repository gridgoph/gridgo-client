import { useCallback, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { useFocusEffect } from "expo-router";

import * as api from "@/lib/api";

export default function OrdersScreen() {
  const [orders, setOrders] = useState<api.Order[]>([]);

  useFocusEffect(
    useCallback(() => {
      void api.listOrders().then(setOrders).catch(() => setOrders([]));
    }, []),
  );

  return (
    <ScrollView className="flex-1 bg-canvas px-5 pt-14">
      <Text className="font-satoshi-bold text-2xl text-text-primary">Orders</Text>
      {orders.map((o) => (
        <View key={o.id} className="mt-4 rounded-2xl border border-outline bg-surface p-4">
          <Text className="font-satoshi-medium text-text-primary">{o.title}</Text>
          <Text className="mt-1 font-satoshi text-sm text-text-secondary">{o.state.replaceAll("_", " ")}</Text>
          <Text className="mt-1 font-satoshi text-sm text-text-muted">
            {api.formatPhp(o.totalMinor + o.deliveryFeeMinor)}
            {o.paymentMethod ? ` · ${o.paymentMethod}` : ""}
          </Text>
        </View>
      ))}
      {!orders.length ? <Text className="mt-6 font-satoshi text-text-muted">No orders yet.</Text> : null}
      <View className="h-12" />
    </ScrollView>
  );
}
