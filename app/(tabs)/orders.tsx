import { useCallback, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { OrderCard } from "@/components/OrderCard";
import { ReplaceDraftDialog } from "@/components/ReplaceDraftDialog";
import { SkeletonOrderList } from "@/components/Skeleton";
import { useStartRequest } from "@/hooks/useStartRequest";
import { tabScreenContentPadding } from "@/components/GridgoTabBar";
import { useThemeColors } from "@/hooks/useTheme";
import * as api from "@/lib/api";
import { userFacingError } from "@/lib/copy";
import { orderNeedsClient } from "@/lib/orderState";
import { useRequestDraft } from "@/store/requestDraft";

/**
 * Every job the client has sent, grouped by who it is waiting on.
 *
 * That grouping is the only structure here, and it earns its place: "waiting on
 * you" is the difference between a list you skim and a list you act on.
 */
export default function OrdersScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const tabPad = tabScreenContentPadding(useSafeAreaInsets().bottom);
  const seedFromOrder = useRequestDraft((s) => s.seedFromOrder);
  const { start, pendingLabel, confirmReplace, cancelReplace } = useStartRequest();

  const [orders, setOrders] = useState<api.Order[]>([]);
  const [catalog, setCatalog] = useState<api.CatalogProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [list, products] = await Promise.all([
        api.listOrders(),
        api.listCatalog().catch(() => [] as api.CatalogProduct[]),
      ]);
      setOrders(list);
      setCatalog(products);
      setError(null);
    } catch (e) {
      setOrders([]);
      setError(userFacingError(e, "Could not load orders. Check your connection and try again."));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const productById = new Map(catalog.map((p) => [p.id, p]));
  const needsClient = orders.filter((o) => orderNeedsClient(o.state));
  const inProgress = orders.filter((o) => !orderNeedsClient(o.state));

  const reorder = (order: api.Order) => {
    const meta = productById.get(order.productId);
    start(order.title, () =>
      seedFromOrder(order, {
        name: meta?.name,
        basePriceMinor: meta?.basePriceMinor,
        unit: meta?.unit,
        family: meta?.family,
      }),
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }} edges={["top"]}>
      <ScrollView className="gg-screen">
        <View className="gg-page pt-4" style={{ paddingBottom: tabPad }}>
          <Text className="text-h1 text-text-primary">Orders</Text>
          <Text className="mt-2 text-body text-text-secondary">
            Open a job to approve a proof, pay, or follow the delivery.
          </Text>

          {error ? (
            <View className="mt-8">
              <ErrorState label="Could not load" body={error} onRetry={() => void load()} />
            </View>
          ) : null}

          {loading ? (
            <View className="mt-8 gap-3">
              <Text className="text-body text-text-muted">Loading your jobs…</Text>
              <SkeletonOrderList count={3} />
            </View>
          ) : null}

          {!loading && needsClient.length ? (
            <View className="mt-8 gap-3">
              <Text className="text-overline text-text-muted">WAITING ON YOU</Text>
              {needsClient.map((o) => (
                <OrderCard key={o.id} order={o} onPress={() => router.push(`/order/${o.id}`)} />
              ))}
            </View>
          ) : null}

          {!loading && inProgress.length ? (
            <View className="mt-8 gap-3">
              <Text className="text-overline text-text-muted">
                {needsClient.length ? "EVERYTHING ELSE" : "YOUR JOBS"}
              </Text>
              {inProgress.map((o) => (
                <OrderCard
                  key={o.id}
                  order={o}
                  onPress={() => router.push(`/order/${o.id}`)}
                  onReorder={() => reorder(o)}
                />
              ))}
            </View>
          ) : null}

          {!loading && !orders.length && !error ? (
            <View className="mt-8">
              <EmptyState
                title="No print jobs yet"
                body="Start with what you are printing. GRIDGO handles the artwork check, the supplier and the delivery from there."
                actionLabel="See what GRIDGO prints"
                onAction={() => router.push("/request/category")}
              />
            </View>
          ) : null}
        </View>
      </ScrollView>

      <ReplaceDraftDialog
        label={pendingLabel}
        onConfirm={confirmReplace}
        onCancel={cancelReplace}
      />
    </SafeAreaView>
  );
}
