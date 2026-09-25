import { useLiveRefresh } from "@/hooks/useLiveRefresh";
import { ChevronRight } from "lucide-react-native";
import { type ReactNode, useCallback, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { TabScreen } from "@/components/TabScreen";
import { ErrorState } from "@/components/ErrorState";
import { GridgoLogo, logoRoleForClientAccount } from "@/components/GridgoLogo";
import { HomeCategoryRow } from "@/components/HomeCategoryRow";
import { HomeSampleStrip } from "@/components/HomeSampleStrip";
import { HomeSearchEntry } from "@/components/HomeSearchEntry";
import { HomeActionRow, HomeFinishedRow, HomeJobRow } from "@/components/HomeRow";
import { PushEnableCard } from "@/components/PushEnableCard";
import { ScreenHeader } from "@/components/ScreenHeader";
import { SkeletonHomeDocket } from "@/components/Skeleton";
import { tabScreenContentPadding } from "@/components/GridgoTabBar";
import { useStartPrintJob } from "@/hooks/useStartPrintJob";
import { useThemeColors } from "@/hooks/useTheme";
import * as api from "@/lib/api";
import { userFacingError } from "@/lib/copy";
import { pickHomeSamples } from "@/lib/homeSamples";
import { homeJobs } from "@/lib/homeJobs";
import { type ProductCategory } from "@/lib/productCategories";
import { HOME_BOARDS, loadCategoryBoards } from "@/lib/shopBoards";
import { useCart } from "@/store/cart";
import { useNotifications } from "@/store/notifications";
import { draftHasContent, useRequestDraft } from "@/store/requestDraft";
import { useSession } from "@/store/session";

/**
 * Home answers two questions, in this order: is anything waiting on me, and
 * how do I start something new.
 *
 * It is a summary, not a second orders list. The Orders tab already carries
 * the full cards, search, filters, sort and reorder. Repeating those cards
 * here is what stretched a handful of jobs across five or six screens.
 *
 * Jobs come in three shapes, in the order they matter (`lib/homeJobs.ts`).
 * Waiting jobs lead with the next verb, grouped as one docket — a flush list,
 * because the question there is "which of these, and what do I do". Jobs in
 * progress are the other question, "where has it got to", so they are cards
 * led by the state in words, with the compact stage rail and what happens
 * next. Finished jobs are one quiet line each: three finished cards used to
 * look exactly like live work and push the start menu off the first screen.
 * Each group is capped; the rest live on Orders, one tap away through
 * "View all".
 *
 * Starting is one section, in the order a person arrives in: search first for
 * someone who already knows they want a tarpaulin, then the five categories
 * for someone who is looking. Those five are one full-width board, not a grid:
 * two columns orphaned the fifth family beside an empty half-row and cut the
 * contents line off mid-item on most of the rest. The search bar deliberately
 * sits inside that section rather than at the top of the screen — question one
 * is still whether anything is waiting, and a bar pinned above the docket
 * would answer question two first. The yellow "+" still owns the primary
 * start, so nothing in this column is yellow.
 */
export default function HomeScreen() {
  const { user } = useSession();
  const router = useRouter();
  const colors = useThemeColors();
  const tabPad = tabScreenContentPadding(useSafeAreaInsets().bottom);
  const draftTitle = useRequestDraft((s) => s.title || s.productName);
  const hasDraft = useRequestDraft(draftHasContent);
  const refreshNotifications = useNotifications((s) => s.refresh);
  const startJob = useStartPrintJob();
  const loadCart = useCart((s) => s.load);

  const [orders, setOrders] = useState<api.Order[]>([]);
  const [categories, setCategories] = useState<ProductCategory[]>(() => api.productCategoriesNow());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [boards, setBoards] = useState<api.ShopBoard[] | null>(null);
  const [boardsLoading, setBoardsLoading] = useState(false);

  /**
   * The shops' boards, read only for a client with nothing on press.
   *
   * A returning client's Home is already answering a question, so it does not
   * spend a phone's data on a browse strip nobody asked for. A failed read
   * leaves the strip out rather than showing an empty shelf: the start board
   * under it answers everything the strip does, one tap further along.
   */
  const loadSequence = useRef(0);
  const loadSamples = useCallback(async (sequence: number) => {
    setBoardsLoading(true);
    try {
      const read = await loadCategoryBoards("", { maxBoards: HOME_BOARDS });
      if (sequence === loadSequence.current) setBoards(read.boards);
    } catch {
      if (sequence === loadSequence.current) setBoards([]);
    } finally {
      if (sequence === loadSequence.current) setBoardsLoading(false);
    }
  }, []);

  const load = useCallback(async () => {
    const sequence = ++loadSequence.current;
    setBoardsLoading(false);
    try {
      const list = await api.listOrders();
      if (sequence !== loadSequence.current) return;
      setOrders(list);
      setError(null);
      if (list.length === 0) void loadSamples(sequence);
    } catch (e) {
      if (sequence !== loadSequence.current) return;
      setOrders([]);
      setError(userFacingError(e, "Could not load home. Check your connection and try again."));
    } finally {
      if (sequence === loadSequence.current) setLoading(false);
    }
    void api
      .getProductCategories()
      .then((tree) => {
        // An empty payload must not blank the seed already on screen.
        if (sequence === loadSequence.current && tree.length) setCategories(tree);
      })
      .catch(() => {
        // Seed already on screen.
      });
    void refreshNotifications();
    // The basket lives on GRIDGO, so the count on the cart control is only
    // honest if it is re-read. Coming back from checkout is exactly when it
    // has changed.
    void loadCart();
  }, [refreshNotifications, loadCart, loadSamples]);

  useLiveRefresh(["orders", "catalog", "services", "availability", "settings", "credits"], load, { refreshOnFocus: false });

  useFocusEffect(
    useCallback(() => {
      void load();
      return () => { loadSequence.current++; };
    }, [load]),
  );

  const jobs = homeJobs(orders);
  const showJobs = !loading && !error;
  // "View all" rides on whichever of the two quieter sections comes first.
  // The docket never needs it: every waiting job is already on it.
  const viewAllOn = jobs.inProgress.length ? "inProgress" : "finished";

  // Nothing on press: the one moment Home has room to introduce the platform
  // rather than report on it.
  const welcoming = !loading && !error && orders.length === 0;
  const samples = useMemo(
    () => (boards ? pickHomeSamples(categories, boards) : []),
    [boards, categories],
  );
  const showSamples = welcoming && (boardsLoading || samples.length > 0);

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
            A client with nothing on press gets a greeting and a sentence
            saying what happens next. The name is not in the header row — that
            split the top of Home into chrome and a greeting and pushed the
            jobs slot down for everyone. Here it costs nothing, because this
            block only exists on the one Home that has no jobs to report.

            It is not the grey "No print jobs yet" panel that used to sit here.
            That spent the best space on the screen on a button that went
            exactly where the board below already goes; this says what GRIDGO
            does with the job and then gets out of the way.
          */}
          {welcoming ? (
            <View className="mt-6">
              <Text className="text-h1 text-text-primary">{greeting(user?.name)}</Text>
              <Text className="mt-2 text-body text-text-secondary">
                Nothing on press yet. Choose what you need and GRIDGO finds the printer.
              </Text>
            </View>
          ) : null}

          {/*
            A draft in progress is a fact the client cannot see anywhere else,
            so Home surfaces it as a way back into it. It sits with the waiting
            work rather than with the menu below, because it is a job of theirs
            that has stalled, not a new one to start.
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
            The placeholder is the docket's own shape, because the docket is
            the case that matters: a job waiting on the client must not appear
            to arrive late. Categories paint from seed on the first frame and
            are not placeholdered.
          */}
          {loading ? (
            <View className="mt-8 gap-3">
              <SectionHead label="YOUR JOBS" />
              <SkeletonHomeDocket count={2} />
            </View>
          ) : null}

          {showJobs && jobs.needsYou.length ? (
            <View className="mt-8 gap-3">
              <SectionHead label="NEEDS YOU" count={jobs.needsYou.length} />
              <View className="gg-card-flush">
                {jobs.needsYou.map((order, index) => (
                  <View key={order.id}>
                    {index > 0 ? <View className="gg-divider" /> : null}
                    <HomeActionRow order={order} onPress={() => router.push(`/order/${order.id}`)} />
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          {showJobs && jobs.inProgress.length ? (
            <View className="mt-8 gap-3">
              <SectionHead
                label="IN PROGRESS"
                count={jobs.inProgressTotal}
                action={viewAllOn === "inProgress" ? <ViewAll total={orders.length} /> : null}
              />
              <View className="gap-3">
                {jobs.inProgress.map((order) => (
                  <HomeJobRow
                    key={order.id}
                    order={order}
                    onPress={() => router.push(`/order/${order.id}`)}
                  />
                ))}
              </View>
            </View>
          ) : null}

          {showJobs && jobs.finished.length ? (
            <View className="mt-8 gap-3">
              {/*
                Finished work is a flush list of one-line rows, not cards: it
                is there to be found again, not to be watched. No count — how
                many jobs a client has finished answers nothing on Home.
              */}
              <SectionHead
                label="RECENTLY FINISHED"
                action={viewAllOn === "finished" ? <ViewAll total={orders.length} /> : null}
              />
              <View className="gg-card-flush">
                {jobs.finished.map((order, index) => (
                  <View key={order.id}>
                    {index > 0 ? <View className="gg-divider" /> : null}
                    <HomeFinishedRow
                      order={order}
                      onPress={() => router.push(`/order/${order.id}`)}
                    />
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          {/*
            Phone notifications, while this phone has not said yes. Home is
            where every client lands, so the way to turn them on — after "Not
            now" on the explainer, or after Android blocked them — never
            depends on finding a secondary screen. After the jobs, because a
            job waiting on the client outranks a setting; before the menu,
            because below it nobody scrolls. Draws nothing once granted.
          */}
          <PushEnableCard spacing="section" />

          {/*
            Real work, before the menu that describes it. A first screen that
            only lists families never shows a client one thing GRIDGO makes,
            and a photograph of a printed tarpaulin at a real starting price
            does more for that than any amount of copy.
          */}
          {showSamples ? (
            <View className="mt-8 gap-3">
              <SectionHead label="ON PRESS TODAY" />
              <HomeSampleStrip
                samples={samples}
                loading={boardsLoading && samples.length === 0}
                onPick={(sample) => startJob(sample.category.code, sample.subcategory.code)}
              />
            </View>
          ) : null}

          {categories.length ? (
            <View className="mt-8 gap-3">
              {/*
                The empty Home's call to act is this board, so it says so. The
                yellow "+" is still the one filled start control.
              */}
              <SectionHead label={welcoming ? "START YOUR FIRST PRINT" : "START A PRINT"} />
              <HomeSearchEntry onPress={() => router.push("/request/category")} />
              {/*
                One board, not a grid. Five families in two columns left the
                fifth alone beside an empty half-row and cut the contents line
                off mid-item on most of the others; in one column every row is
                full width, every name and contents line is set whole, and the
                five read as one scan down the page. The crop-marked mark is
                what keeps this board apart from the docket above it.
              */}
              <View className="gg-card-flush">
                {categories.map((category, index) => (
                  <View key={category.code}>
                    {index > 0 ? <View className="gg-divider" /> : null}
                    <HomeCategoryRow
                      category={category}
                      onPress={() => router.push(`/request/${category.code}`)}
                    />
                  </View>
                ))}
              </View>
            </View>
          ) : null}

        </View>
      </ScrollView>
    </TabScreen>
  );
}

/**
 * The way from Home's snapshot to the full list on Orders.
 *
 * Always offered once there are jobs to show, not only when some are hidden:
 * Orders is where search, filters and reorder live, and a client looking for
 * those should not have to know the tab bar holds them. It is the one place
 * the design system spends the brand token, and it is a small link, not a
 * fill.
 */
function ViewAll({ total }: { total: number }) {
  const router = useRouter();

  return (
    <Pressable
      onPress={() => router.navigate("/(tabs)/orders")}
      accessibilityRole="button"
      accessibilityLabel={`View all ${total} jobs`}
      className="gg-touch justify-center"
      style={({ pressed }) => (pressed ? { opacity: 0.6 } : undefined)}
    >
      <Text className="text-button text-brand">View all</Text>
    </Pressable>
  );
}

/**
 * One section eyebrow on Home.
 *
 * Every section on this screen used to open with a bare grey overline, and
 * four of them in a column is what made the page read as three identical
 * slabs. The eyebrow itself stays exactly that — quiet, uppercase, ink — but
 * it now carries the two things a section head is actually for.
 *
 * A count, where the number is the point: "is anything waiting on me" is
 * answered by "three" before a word of the docket is read, and the pill is
 * neutral ink rather than a colour, because three jobs waiting is a fact and
 * not an alarm. And the way out, where there is one — "View all" is the single
 * place on Home that spends the brand token, and it is a small link.
 *
 * The label is its own text node on purpose: a count concatenated into it
 * would make "NEEDS YOU" a string that changes with the data.
 */
function SectionHead({
  label,
  count,
  action,
}: {
  label: string;
  count?: number;
  action?: ReactNode;
}) {
  return (
    <View className="flex-row items-center gap-2">
      <Text className="text-overline text-text-muted">{label}</Text>
      {count != null && count > 0 ? (
        <View className="rounded-pill border border-outline bg-surface px-2 py-0.5">
          <Text className="text-caption text-text-secondary">{count}</Text>
        </View>
      ) : null}
      <View className="flex-1" />
      {action}
    </View>
  );
}

/**
 * The headline over an empty Home.
 *
 * The client's own first name where GRIDGO holds one, because this is the one
 * place on Home addressed to the person rather than to their work. A session
 * without a name gets a welcome instead of "Hello," with nothing after it.
 */
function greeting(name: string | null | undefined): string {
  const first = (name ?? "").trim().split(/\s+/)[0];
  return first ? `Hello, ${first}` : "Welcome to GRIDGO";
}
