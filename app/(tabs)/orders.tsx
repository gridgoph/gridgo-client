import { useLiveRefresh } from "@/hooks/useLiveRefresh";
import { useCallback, useMemo, useRef, useState } from "react";
import { Platform, Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { TabScreen } from "@/components/TabScreen";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { OrderCard } from "@/components/OrderCard";
import { OrderFilterBar } from "@/components/OrderFilterBar";
import { ScreenHeader } from "@/components/ScreenHeader";
import { ReplaceDraftDialog } from "@/components/ReplaceDraftDialog";
import { KEYBOARD_CARET_GAP } from "@/components/FormScreen";
import { SkeletonOrderList } from "@/components/Skeleton";
import { useStartRequest } from "@/hooks/useStartRequest";
import { tabScreenContentPadding } from "@/components/GridgoTabBar";
import * as api from "@/lib/api";
import { userFacingError } from "@/lib/copy";
import {
  DEFAULT_ORDER_SORT,
  ORDER_CONTROLS_MIN,
  emptyResultBody,
  filterCounts,
  visibleOrders,
  type OrderFilter,
  type OrderSort,
} from "@/lib/orderList";
import { orderNeedsClient } from "@/lib/orderState";
import { useRequestDraft } from "@/store/requestDraft";

/**
 * Every job the client has sent.
 *
 * Grouping by who it is waiting on is the structure that earns its place —
 * "waiting on you" is the difference between a list you skim and a list you
 * act on — so it survives every filter except the ones that already answer the
 * same question.
 *
 * Search, filters and sort appear only once there are enough jobs to hunt
 * through. Three jobs are read, not searched, and a control bar over them is
 * furniture around an answer already on screen.
 */
export default function OrdersScreen() {
  const router = useRouter();
  const tabPad = tabScreenContentPadding(useSafeAreaInsets().bottom);
  const seedFromOrder = useRequestDraft((s) => s.seedFromOrder);
  const { start, pendingLabel, confirmReplace, cancelReplace } = useStartRequest();

  const [orders, setOrders] = useState<api.Order[]>([]);
  const [catalog, setCatalog] = useState<api.CatalogProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<OrderFilter>("all");
  const [sort, setSort] = useState<OrderSort>(DEFAULT_ORDER_SORT);

  const loadSequence = useRef(0);
  const load = useCallback(async () => {
    const sequence = ++loadSequence.current;
    try {
      const [list, products] = await Promise.all([
        api.listOrders(),
        api.listCatalog().catch(() => [] as api.CatalogProduct[]),
      ]);
      if (sequence !== loadSequence.current) return;
      setOrders(list);
      setCatalog(products);
      setError(null);
    } catch (e) {
      if (sequence !== loadSequence.current) return;
      setOrders([]);
      setError(userFacingError(e, "Could not load orders. Check your connection and try again."));
    } finally {
      if (sequence === loadSequence.current) setLoading(false);
    }
  }, []);

  useLiveRefresh(["orders"], load, { refreshOnFocus: false });

  useFocusEffect(
    useCallback(() => {
      void load();
      return () => { loadSequence.current++; };
    }, [load]),
  );

  const productById = new Map(catalog.map((p) => [p.id, p]));
  const counts = useMemo(() => filterCounts(orders), [orders]);
  const visible = useMemo(
    () => visibleOrders(orders, { filter, sort, query }),
    [orders, filter, sort, query],
  );

  /*
    "Waiting on you" is its own heading — unless the filter already means it.
    Splitting a list of two jobs, both of which need the client, under a
    heading that says so is a heading that says nothing.
  */
  const splitByOwner = filter !== "needs_you" && filter !== "payment_due";
  const needsClient = splitByOwner ? visible.filter(orderNeedsClient) : [];
  const everythingElse = splitByOwner ? visible.filter((o) => !orderNeedsClient(o)) : visible;
  const showControls = orders.length >= ORDER_CONTROLS_MIN;

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
    <TabScreen>
      {/* The search field makes this a screen you type on, so it opens through
          the keyboard-aware scroll like every other one — the tab bar sits at
          the bottom and a covered field would be invisible behind it. */}
      <KeyboardAwareScrollView
        className="gg-screen"
        bottomOffset={KEYBOARD_CARET_GAP}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
      >
        <View className="gg-page pt-4" style={{ paddingBottom: tabPad }}>
          <ScreenHeader title="Orders" />

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

          {!loading && showControls ? (
            <View className="mt-6">
              <OrderFilterBar
                query={query}
                onQueryChange={setQuery}
                filter={filter}
                onFilterChange={setFilter}
                counts={counts}
                sort={sort}
                onSortChange={setSort}
                shown={visible.length}
              />
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

          {!loading && everythingElse.length ? (
            <View className="mt-8 gap-3">
              <Text className="text-overline text-text-muted">
                {needsClient.length ? "EVERYTHING ELSE" : "YOUR JOBS"}
              </Text>
              {everythingElse.map((o) => (
                <OrderCard
                  key={o.id}
                  order={o}
                  onPress={() => router.push(`/order/${o.id}`)}
                  onReorder={() => reorder(o)}
                />
              ))}
            </View>
          ) : null}

          {/* Nothing matched, but the client does have jobs — so this is a
              dead end in their own list, not an empty account. */}
          {!loading && !error && orders.length > 0 && !visible.length ? (
            <View className="mt-8">
              <EmptyState
                title="Nothing to show"
                body={emptyResultBody(filter, query)}
                actionLabel="Show all jobs"
                onAction={() => {
                  setFilter("all");
                  setQuery("");
                }}
              />
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
      </KeyboardAwareScrollView>

      <ReplaceDraftDialog
        label={pendingLabel}
        onConfirm={confirmReplace}
        onCancel={cancelReplace}
      />
    </TabScreen>
  );
}
