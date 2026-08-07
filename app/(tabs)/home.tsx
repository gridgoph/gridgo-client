import { useCallback, useState } from "react";
import { Text, View } from "react-native";
import { useFocusEffect } from "expo-router";

import { GridgoLogo } from "@/components/GridgoLogo";
import * as api from "@/lib/api";
import { useSession } from "@/store/session";

export default function HomeScreen() {
  const { user } = useSession();
  const [orders, setOrders] = useState<api.Order[]>([]);
  const [balance, setBalance] = useState<number | null>(null);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      (async () => {
        try {
          const [list, credits] = await Promise.all([api.listOrders(), api.creditBalance()]);
          if (!alive) return;
          setOrders(list);
          setBalance(credits.balanceMinor);
        } catch {
          if (alive) {
            setOrders([]);
            setBalance(null);
          }
        }
      })();
      return () => {
        alive = false;
      };
    }, []),
  );

  return (
    <View className="flex-1 bg-canvas px-5 pt-14">
      <GridgoLogo />
      <Text className="mt-4 font-satoshi-bold text-2xl text-text-primary">
        {user?.orgName || user?.name || "GRIDGO Client"}
      </Text>
      <Text className="mt-1 font-satoshi text-text-secondary">Request · QA · delivery · issue window</Text>
      {balance != null ? (
        <View className="mt-4 rounded-2xl border border-outline bg-surface p-4">
          <Text className="font-satoshi text-text-muted">Pilot Credits</Text>
          <Text className="mt-1 font-satoshi-bold text-2xl text-text-primary">{api.formatPhp(balance)}</Text>
        </View>
      ) : null}
      <Text className="mt-6 font-satoshi-medium text-text-primary">Your orders</Text>
      {orders.slice(0, 5).map((o) => (
        <View key={o.id} className="mt-3 rounded-2xl border border-outline bg-surface p-4">
          <Text className="font-satoshi-medium text-text-primary">{o.title}</Text>
          <Text className="mt-1 font-satoshi text-sm text-text-muted">
            {o.state.replaceAll("_", " ")} · {api.formatPhp(o.totalMinor + o.deliveryFeeMinor)}
          </Text>
        </View>
      ))}
      {!orders.length ? (
        <Text className="mt-3 font-satoshi text-text-muted">No orders yet. Start a new request when ready.</Text>
      ) : null}
    </View>
  );
}
