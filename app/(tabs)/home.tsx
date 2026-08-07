import { useCallback, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { EmptyState } from "@/components/EmptyState";
import { GridgoLogo } from "@/components/GridgoLogo";
import { OrderCard } from "@/components/OrderCard";
import { ProductCard } from "@/components/ProductCard";
import { StatusChip } from "@/components/StatusChip";
import * as api from "@/lib/api";
import { groupCatalogByFamily } from "@/lib/catalog";
import { useThemeColors } from "@/hooks/useTheme";
import { useNotifications } from "@/store/notifications";
import { useRequestDraft } from "@/store/requestDraft";
import { useSession } from "@/store/session";

/**
 * Home: Pilot Credits, recent orders with reorder, and product catalog.
 * Catalog is the entry point into a new print request.
 */
export default function HomeScreen() {
  const { user } = useSession();
  const router = useRouter();
  const colors = useThemeColors();
  const seedFromOrder = useRequestDraft((s) => s.seedFromOrder);
  const selectProduct = useRequestDraft((s) => s.selectProduct);
  const refreshNotifications = useNotifications((s) => s.refresh);

  const [orders, setOrders] = useState<api.Order[]>([]);
  const [catalog, setCatalog] = useState<api.CatalogProduct[]>([]);
  const [balance, setBalance] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      (async () => {
        try {
          const [list, credits, products] = await Promise.all([
            api.listOrders(),
            api.creditBalance(),
            api.listCatalog(),
          ]);
          if (!alive) return;
          setOrders(list);
          setBalance(credits.balanceMinor);
          setCatalog(products);
          setError(null);
        } catch (e) {
          if (!alive) return;
          setOrders([]);
          setBalance(null);
          setCatalog([]);
          setError(e instanceof Error ? e.message : "Could not load home");
        }
        void refreshNotifications();
      })();
      return () => {
        alive = false;
      };
    }, [refreshNotifications]),
  );

  const groups = groupCatalogByFamily(catalog);
  const productById = new Map(catalog.map((p) => [p.id, p]));

  const startWithProduct = (product: api.CatalogProduct) => {
    selectProduct(product);
    router.push("/(tabs)/new-request");
  };

  const reorder = (order: api.Order) => {
    const meta = productById.get(order.productId);
    seedFromOrder(order, {
      name: meta?.name,
      basePriceMinor: meta?.basePriceMinor,
      unit: meta?.unit,
      family: meta?.family,
    });
    router.push("/(tabs)/new-request");
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }} edges={["top"]}>
      <ScrollView className="gg-screen" keyboardShouldPersistTaps="handled">
        <View className="gg-page gap-6 pb-10 pt-4">
        <View>
          <GridgoLogo />
          <Text className="mt-4 text-h2 text-text-primary">
            {user?.orgName || user?.name || "GRIDGO Client"}
          </Text>
          <Text className="mt-1 text-body text-text-secondary">
            Request · QA · delivery · issue window
          </Text>
        </View>

        {error ? (
          <View className="gg-card">
            <StatusChip tone="error" label="Could not load" icon="circle-x" />
            <Text className="mt-2 text-body text-error">{error}</Text>
          </View>
        ) : null}

        {balance != null ? (
          <View className="gg-card">
            <Text className="text-caption text-text-muted">Pilot Credits</Text>
            <Text className="mt-1 text-h2 text-text-primary">{api.formatPhp(balance)}</Text>
            <Text className="mt-2 text-caption text-text-muted">
              Non-cash and non-transferable. No top-up in this app.
            </Text>
          </View>
        ) : null}

        <View className="gap-3">
          <View className="flex-row items-center justify-between">
            <Text className="text-h3 text-text-primary">Recent orders</Text>
            <Pressable
              onPress={() => router.push("/(tabs)/orders")}
              accessibilityRole="button"
              className="gg-touch items-center justify-center px-2"
            >
              <Text className="text-body font-medium text-brand">View all</Text>
            </Pressable>
          </View>
          {orders.slice(0, 3).map((o) => (
            <View key={o.id} className="gap-2">
              <OrderCard order={o} onPress={() => router.push(`/order/${o.id}`)} />
              <Pressable
                onPress={() => reorder(o)}
                accessibilityRole="button"
                accessibilityLabel={`Reorder ${o.title}`}
                className="gg-btn-secondary self-start"
              >
                <Text className="text-button text-text-primary">Reorder</Text>
              </Pressable>
            </View>
          ))}
          {!orders.length ? (
            <EmptyState
              title="No orders yet"
              body="Pick a product below to start a print request."
            />
          ) : null}
        </View>

        <View className="gap-4">
          <Text className="text-h3 text-text-primary">Catalog</Text>
          <Text className="text-body text-text-secondary">
            Product-first browsing. Tap a card to start a request.
          </Text>
          {groups.map((group) => (
            <View key={group.family} className="gap-3">
              <Text className="text-overline text-text-muted">{group.label.toUpperCase()}</Text>
              {group.products.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  onPress={() => startWithProduct(product)}
                />
              ))}
            </View>
          ))}
          {!catalog.length && !error ? (
            <EmptyState title="Catalog empty" body="No products returned from the API." />
          ) : null}
        </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
