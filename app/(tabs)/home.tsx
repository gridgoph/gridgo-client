import { ChevronRight } from "lucide-react-native";
import { useCallback, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { TabScreen } from "@/components/TabScreen";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { GridgoLogo, logoRoleForClientAccount } from "@/components/GridgoLogo";
import { HomeCategoryTile } from "@/components/HomeCategoryTile";
import { HomeActionRow, HomeJobRow } from "@/components/HomeRow";
import { ScreenHeader } from "@/components/ScreenHeader";
import { SkeletonHomeDocket } from "@/components/Skeleton";
import { tabScreenContentPadding } from "@/components/GridgoTabBar";
import { useThemeColors } from "@/hooks/useTheme";
import * as api from "@/lib/api";
import { userFacingError } from "@/lib/copy";
import { orderNeedsClient } from "@/lib/orderState";
import { type ProductCategory } from "@/lib/productCategories";
import { useCart } from "@/store/cart";
import { useNotifications } from "@/store/notifications";
import { draftHasContent, useRequestDraft } from "@/store/requestDraft";
import { useSession } from "@/store/session";

/** Snapshot, not a list. Orders is one tab away. */
const RECENT_LIMIT = 3;

/**
 * Home answers two questions, in this order: is anything waiting on me, and
 * how do I start something new.
 *
 * It is a summary, not a second orders list. The Orders tab already carries
 * the full cards, search, filters, sort and reorder. Repeating those cards
 * here is what stretched a handful of jobs across five or six screens.
 *
 * Waiting jobs therefore lead with the next verb, grouped as one docket.
 * Starting is the category tiles — the yellow "+" already owns the primary
 * start, so nothing else on this screen is yellow. Recent jobs only appear
 * when nothing needs the client; otherwise they live on Orders.
 */
export default function HomeScreen() {
  const { user } = useSession();
  const router = useRouter();
  const colors = useThemeColors();
  const tabPad = tabScreenContentPadding(useSafeAreaInsets().bottom);
  const draftTitle = useRequestDraft((s) => s.title || s.productName);
  const hasDraft = useRequestDraft(draftHasContent);
  const refreshNotifications = useNotifications((s) => s.refresh);
  const loadCart = useCart((s) => s.load);

  const [orders, setOrders] = useState<api.Order[]>([]);
  const [categories, setCategories] = useState<ProductCategory[]>(() => api.productCategoriesNow());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const list = await api.listOrders();
      setOrders(list);
      setError(null);
    } catch (e) {
      setOrders([]);
      setError(userFacingError(e, "Could not load home. Check your connection and try again."));
    } finally {
      setLoading(false);
    }
    void api
      .getProductCategories()
      .then((tree) => {
        // An empty payload must not blank the seed already on screen.
        if (tree.length) setCategories(tree);
      })
      .catch(() => {
        // Seed already on screen.
      });
    void refreshNotifications();
    // The basket lives on GRIDGO, so the count on the cart control is only
    // honest if it is re-read. Coming back from checkout is exactly when it
    // has changed.
    void loadCart();
  }, [refreshNotifications, loadCart]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const needsClient = orders.filter(orderNeedsClient);
  const recent = needsClient.length === 0 ? orders.slice(0, RECENT_LIMIT) : [];

  return (
    <TabScreen>
      <ScrollView className="gg-screen">
        <View className="gg-page pt-4" style={{ paddingBottom: tabPad }}>
          {/*
            One header: the mark, and cart and chat as the two ways back into
            work already in flight. The client's name lives on Account — putting
            it here split the top of Home into chrome and a greeting, and the
            jobs slot starts higher without it.

            No portrait, illustration or photo in this row. The mark is the
            identity here, and a second image beside it would make the header
            about the account rather than about the work.
          */}
          <ScreenHeader>
            <GridgoLogo role={logoRoleForClientAccount(user?.accountType)} />
          </ScreenHeader>

          {/*
            No "start a request" button in the page. The yellow "+" floats on
            the bottom right of every main tab, and a second one in this column
            would be the same action twice. A draft in progress is different:
            it is a fact the client cannot see anywhere else, so Home surfaces
            it as a way back into it.
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
            One jobs slot, so the page does not resettle when the list lands.
            The placeholder is a flush docket of dense rows — the shape of
            both the needs-you list and the recent snapshot. Categories paint
            from seed on the first frame and are not placeholdered.
          */}
          {loading ? (
            <View className="mt-8 gap-3">
              <Text className="text-overline text-text-muted">YOUR JOBS</Text>
              <SkeletonHomeDocket count={2} />
            </View>
          ) : null}

          {!loading && !error && needsClient.length ? (
            <View className="mt-8 gap-3">
              <Text className="text-overline text-text-muted">NEEDS YOU</Text>
              <View className="gg-card-flush">
                {needsClient.map((order, index) => (
                  <View key={order.id}>
                    {index > 0 ? <View className="gg-divider" /> : null}
                    <HomeActionRow order={order} onPress={() => router.push(`/order/${order.id}`)} />
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          {!loading && !error && recent.length ? (
            <View className="mt-8 gap-3">
              <Text className="text-overline text-text-muted">YOUR JOBS</Text>
              <View className="gg-card-flush">
                {recent.map((order, index) => (
                  <View key={order.id}>
                    {index > 0 ? <View className="gg-divider" /> : null}
                    <HomeJobRow order={order} onPress={() => router.push(`/order/${order.id}`)} />
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          {!loading && !error && !orders.length ? (
            <View className="mt-8">
              <EmptyState
                title="No print jobs yet"
                body="Start with what you are printing — flyers, tarpaulins, lanyards, apparel — and GRIDGO takes it from there."
                actionLabel="See what GRIDGO prints"
                onAction={() => router.push("/request/category")}
              />
            </View>
          ) : null}

          {categories.length ? (
            <View className="mt-8 gap-3">
              <Text className="text-overline text-text-muted">START A PRINT</Text>
              {categoryRows(categories).map((row) => (
                <View key={row.map((category) => category.code).join("-")} className="flex-row gap-3">
                  {row.map((category) => (
                    <View key={category.code} className="flex-1">
                      <HomeCategoryTile
                        category={category}
                        onPress={() => router.push(`/request/${category.code}`)}
                      />
                    </View>
                  ))}
                  {row.length === 1 ? (
                    <View
                      className="flex-1"
                      accessibilityElementsHidden
                      importantForAccessibility="no-hide-descendants"
                    />
                  ) : null}
                </View>
              ))}
            </View>
          ) : null}
        </View>
      </ScrollView>
    </TabScreen>
  );
}

/** Two tiles to a row so five categories sit in three short rows, not five tall cards. */
function categoryRows(categories: ProductCategory[]): ProductCategory[][] {
  const rows: ProductCategory[][] = [];
  for (let index = 0; index < categories.length; index += 2) {
    rows.push(categories.slice(index, index + 2));
  }
  return rows;
}
