import { ChevronRight } from "lucide-react-native";
import { useCallback, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { GridgoLogo, logoRoleForClientAccount } from "@/components/GridgoLogo";
import { OrderCard } from "@/components/OrderCard";
import { ReplaceDraftDialog } from "@/components/ReplaceDraftDialog";
import { SkeletonList, SkeletonOrderList } from "@/components/Skeleton";
import { useStartRequest } from "@/hooks/useStartRequest";
import { tabScreenContentPadding } from "@/components/GridgoTabBar";
import { useThemeColors } from "@/hooks/useTheme";
import * as api from "@/lib/api";
import { userFacingError } from "@/lib/copy";
import { orderNeedsClient } from "@/lib/orderState";
import { type ProductCategory } from "@/lib/productCategories";
import { useNotifications } from "@/store/notifications";
import { draftHasContent, useRequestDraft } from "@/store/requestDraft";
import { useSession } from "@/store/session";

/**
 * Home answers three questions, in this order: is anything waiting on me, what
 * is my pilot balance, and how do I start something new.
 *
 * The flat product list this used to end with is gone. Five catalog rows was
 * never the catalog — GRIDGO prints seventeen things across four categories,
 * and browsing them is a considered screen of its own now, reached from here.
 */
export default function HomeScreen() {
  const { user } = useSession();
  const router = useRouter();
  const colors = useThemeColors();
  const tabPad = tabScreenContentPadding(useSafeAreaInsets().bottom);
  const seedFromOrder = useRequestDraft((s) => s.seedFromOrder);
  const draftTitle = useRequestDraft((s) => s.title || s.productName);
  const hasDraft = useRequestDraft(draftHasContent);
  const refreshNotifications = useNotifications((s) => s.refresh);
  const { start, pendingLabel, confirmReplace, cancelReplace } = useStartRequest();

  const [orders, setOrders] = useState<api.Order[]>([]);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [catalog, setCatalog] = useState<api.CatalogProduct[]>([]);
  const [balance, setBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [list, credits, products, tree] = await Promise.all([
        api.listOrders(),
        api.creditBalance(),
        api.listCatalog(),
        api.getProductCategories(),
      ]);
      setOrders(list);
      setBalance(credits.balanceMinor);
      setCatalog(products);
      setCategories(tree);
      setError(null);
    } catch (e) {
      setOrders([]);
      setBalance(null);
      setCatalog([]);
      setCategories([]);
      setError(userFacingError(e, "Could not load home. Check your connection and try again."));
    } finally {
      setLoading(false);
    }
    void refreshNotifications();
  }, [refreshNotifications]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const productById = new Map(catalog.map((p) => [p.id, p]));
  const needsClient = orders.filter((o) => orderNeedsClient(o.state));
  const recent = orders.filter((o) => !orderNeedsClient(o.state)).slice(0, 3);

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
          <GridgoLogo role={logoRoleForClientAccount(user?.accountType)} />
          <Text className="mt-5 text-h1 text-text-primary" numberOfLines={2}>
            {user?.orgName || user?.name || "GRIDGO"}
          </Text>

          {balance != null ? (
            <View className="mt-4 flex-row items-baseline gap-3">
              <Text className="text-body text-text-secondary">Pilot Credits</Text>
              <Text className="text-body-lg font-medium text-text-primary">
                {api.formatPhp(balance)}
              </Text>
            </View>
          ) : null}

          {/*
            No "start a request" button here. The tab bar's yellow "+" is that
            control, it is on every screen, and Home was drawing a second one
            directly above it — the same action, in the same colour, 60px apart.

            A draft in progress is different: it is a fact the client cannot see
            anywhere else, and it disappears the moment they start something new.
            So Home surfaces it, quietly, as a way back into it.
          */}
          {hasDraft ? (
            <Pressable
              onPress={() => router.push("/(tabs)/new-request")}
              accessibilityRole="button"
              accessibilityLabel={`Continue your request for ${draftTitle || "an unnamed job"}`}
              className="mt-6 gg-panel-high gg-touch flex-row items-center gap-3"
            >
              {({ pressed }) => (
                <>
                  <View className="flex-1">
                    <Text className="text-caption text-text-muted">Request in progress</Text>
                    <Text
                      className="mt-1 text-body-lg font-medium text-text-primary"
                      numberOfLines={1}
                    >
                      {draftTitle || "An unnamed request"}
                    </Text>
                  </View>
                  <ChevronRight size={18} color={colors.textMuted} strokeWidth={2} />
                  {pressed ? (
                    <View pointerEvents="none" className="gg-pressed absolute inset-0 rounded-card" />
                  ) : null}
                </>
              )}
            </Pressable>
          ) : null}

          {error ? (
            <View className="mt-8">
              <ErrorState label="Could not load" body={error} onRetry={() => void load()} />
            </View>
          ) : null}

          {/*
            The placeholder is the shape of what replaces it — a jobs section
            and a browse section, in order-card and category-card proportions —
            so the page keeps its height and the list does not resettle under
            the client's thumb when the data lands.
          */}
          {loading ? (
            <>
              <View className="mt-10 gap-3">
                <Text className="text-overline text-text-muted">YOUR JOBS</Text>
                <SkeletonOrderList count={2} />
              </View>
              <View className="mt-10 gap-3">
                <Text className="text-overline text-text-muted">
                  BROWSE WHAT GRIDGO PRINTS
                </Text>
                <SkeletonList count={2} />
              </View>
            </>
          ) : null}

          {!loading && needsClient.length ? (
            <View className="mt-10 gap-3">
              <Text className="text-overline text-text-muted">WAITING ON YOU</Text>
              {needsClient.map((o) => (
                <OrderCard key={o.id} order={o} onPress={() => router.push(`/order/${o.id}`)} />
              ))}
            </View>
          ) : null}

          {!loading && !error ? (
            <View className="mt-10 gap-3">
              {/* No "View all" link. Orders is a permanent tab one row below
                  this, so the link navigated to a place already on screen —
                  and in Dark its brand gold is the action yellow exactly, so
                  it spent the screen's attention budget to do nothing. */}
              <Text className="text-overline text-text-muted">RECENT JOBS</Text>

              {recent.map((o) => (
                <OrderCard
                  key={o.id}
                  order={o}
                  onPress={() => router.push(`/order/${o.id}`)}
                  onReorder={() => reorder(o)}
                />
              ))}

              {!orders.length ? (
                <EmptyState
                  title="No print jobs yet"
                  body="Start with what you are printing — flyers, tarpaulins, lanyards, apparel — and GRIDGO takes it from there."
                  actionLabel="See what GRIDGO prints"
                  onAction={() => router.push("/request/category")}
                />
              ) : null}

              {orders.length && !recent.length ? (
                <Text className="text-body text-text-muted">
                  Everything you have sent is waiting on you above.
                </Text>
              ) : null}
            </View>
          ) : null}

          {categories.length ? (
            <View className="mt-10 gap-3">
              <Text className="text-overline text-text-muted">BROWSE WHAT GRIDGO PRINTS</Text>
              {categories.map((category) => (
                <Pressable
                  key={category.code}
                  onPress={() => router.push(`/request/${category.code}`)}
                  accessibilityRole="button"
                  accessibilityLabel={category.name}
                  accessibilityHint={`Best for ${category.bestFor}`}
                  className="gg-card gg-touch flex-row items-center gap-3"
                >
                  {({ pressed }) => (
                    <>
                      <View className="flex-1">
                        <Text className="text-body-lg font-medium text-text-primary">
                          {category.name}
                        </Text>
                        <Text className="mt-1 text-caption text-text-muted" numberOfLines={2}>
                          {category.subcategories.map((s) => s.name).join(" · ")}
                        </Text>
                      </View>
                      <ChevronRight size={18} color={colors.textMuted} strokeWidth={2} />
                      {pressed ? (
                        <View pointerEvents="none" className="gg-pressed absolute inset-0 rounded-card" />
                      ) : null}
                    </>
                  )}
                </Pressable>
              ))}
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
