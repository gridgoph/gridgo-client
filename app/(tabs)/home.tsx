import { useLiveRefresh } from "@/hooks/useLiveRefresh";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Platform, Pressable, Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useFocusEffect, useRouter, type Href } from "expo-router";

import { TabScreen } from "@/components/TabScreen";
import { KEYBOARD_CARET_GAP } from "@/components/FormScreen";
import { GridgoLogo, logoRoleForClientAccount } from "@/components/GridgoLogo";
import { HomeCategoryCircles } from "@/components/HomeCategoryCircles";
import { HomeFeaturedPrints } from "@/components/HomeFeaturedPrints";
import { HomeReorderTile } from "@/components/HomeReorderTile";
import { RetiredDraftNotice } from "@/components/RetiredDraftNotice";
import { HomeSearch } from "@/components/HomeSearch";
import { HomeActionRow } from "@/components/HomeRow";
import { HomeSmartTile } from "@/components/HomeSmartTile";
import { HomeTesterSlot } from "@/components/HomeTesterSlot";
import { ScreenHeader } from "@/components/ScreenHeader";
import { SeasonBanner } from "@/components/SeasonBanner";
import { TourTarget } from "@/components/TourTarget";
import { LegalNoticeBanner } from "@/components/legal/LegalNoticeBanner";
import { usePhotoLinkRefresh } from "@/hooks/usePhotoLinkRefresh";
import { useReorder } from "@/hooks/useReorder";
import { useStartPrintJob } from "@/hooks/useStartPrintJob";
import { useTourAutoStart, useTourScreen } from "@/hooks/useTourScreen";
import * as api from "@/lib/api";
import { foundingTesterView } from "@/lib/foundingTester";
import { featuredPrintsFrom, keepHeldFeatured, type HomeSample } from "@/lib/homeSamples";
import { homeJobs } from "@/lib/homeJobs";
import { lastOrder, smartTileView } from "@/lib/homeSummary";
import { bannersToShow, davaoToday } from "@/lib/seasonWindows";
import { type ProductCategory } from "@/lib/productCategories";
import { useBasketGroupTarget } from "@/store/basketGroup";
import { useCart } from "@/store/cart";
import { useHomeSummary, useOwnHomeSummary } from "@/store/homeSummary";
import { useNotifications } from "@/store/notifications";
import { useRequestDraft } from "@/store/requestDraft";
import { useSeasonWindows } from "@/store/seasonWindows";
import { useFoundingTester } from "@/store/foundingTester";
import { useSession } from "@/store/session";
import { useTesterProgram } from "@/store/testerProgram";

/**
 * Home is one phone screen with no scrolling (client#335): the mark, cart and
 * theme; a search that greets the client; Featured Prints; the five families
 * as one row of round buttons; and two tiles — the smart tile and Reorder.
 *
 * Featured Prints is the one part that flexes, so on a small phone it shrinks
 * first and nothing else moves; nothing on it moves by itself either. The full
 * job list lives on Orders; Home keeps a single line for a job that is waiting
 * on the client, because "is anything waiting on me" must never need a second
 * tab to answer.
 * The yellow "+" in the tab bar opens every other action.
 */
export default function HomeScreen() {
  const user = useSession((s) => s.user);
  const router = useRouter();
  const refreshNotifications = useNotifications((s) => s.refresh);
  const refreshAccount = useSession((s) => s.refresh);
  const startJob = useStartPrintJob();
  const loadCart = useCart((s) => s.load);
  const seasons = useSeasonWindows((s) => s.seasons);
  const dismissedSeasons = useSeasonWindows((s) => s.dismissed);
  const seasonsHydrated = useSeasonWindows((s) => s.hydrated);
  const loadSeasons = useSeasonWindows((s) => s.load);
  const dismissSeason = useSeasonWindows((s) => s.dismiss);
  const summary = useOwnHomeSummary();
  const summaryFailed = useHomeSummary((s) => s.failed);
  const { reorder } = useReorder();
  const retiredDraft = useRequestDraft((s) => s.retiredNotice);
  const dismissRetiredDraft = useRequestDraft((s) => s.dismissRetiredNotice);

  const [orders, setOrders] = useState<api.Order[] | null>(null);
  const [categories, setCategories] = useState<ProductCategory[]>(() => api.productCategoriesNow());
  const [samples, setSamples] = useState<HomeSample[] | null>(null);

  // FEATURED PRINTS: GRIDGO's curated list (`GET /featured-prints`). An empty
  // or failed read leaves the block out rather than showing an empty shelf.
  const loadSequence = useRef(0);
  const rereadSamples = useCallback(async () => {
    const read = featuredPrintsFrom(await api.getFeaturedPrints());
    setSamples(read);
    return read;
  }, []);
  const onStalePhoto = usePhotoLinkRefresh(samples?.length ? samples : null, rereadSamples);

  const load = useCallback(async () => {
    const sequence = ++loadSequence.current;
    void api
      .listOrders()
      .then((list) => {
        if (sequence === loadSequence.current) setOrders(list);
      })
      .catch(() => {
        // Home still starts a print; the waiting line and Reorder wait.
        if (sequence === loadSequence.current) setOrders((current) => current ?? []);
      });
    void api
      .getFeaturedPrints()
      .then((body) => {
        // The same cards keep the list on screen: a fresh signature on the
        // same photos is not a reason to redraw (`keepHeldFeatured`).
        if (sequence === loadSequence.current) {
          const read = featuredPrintsFrom(body);
          setSamples((held) => keepHeldFeatured(held, read));
        }
      })
      .catch(() => {
        if (sequence === loadSequence.current) setSamples((current) => current ?? []);
      });
    void api
      .getProductCategories()
      .then((tree) => {
        // An empty payload must not blank the seed already on screen.
        if (sequence === loadSequence.current && tree.length) setCategories(tree);
      })
      .catch(() => {
        // Seed already on screen.
      });
    void useHomeSummary.getState().load(useSession.getState().user?.id ?? null);
    // A Google Play tester's open is the day's check-in (nothing for anyone else).
    void useTesterProgram.getState().load(useSession.getState().user?.id ?? null);
    void refreshNotifications();
    // The basket lives on GRIDGO, so the count on the cart control is only
    // honest if it is re-read. Coming back from checkout is exactly when it
    // has changed.
    void loadCart();
    void loadSeasons();
    // The Founding Tester missions ride on the account.
    void refreshAccount();
    const tester = foundingTesterView(useSession.getState().user);
    if (tester?.kind === "missions" && tester.steps.some((step) => step.key === "rated" && step.status === "next")) {
      void useFoundingTester.getState().loadOpenSurveys();
    }
  }, [refreshNotifications, loadCart, loadSeasons, refreshAccount]);

  useLiveRefresh(["orders", "catalog", "identity", "settings", "credits"], load, { refreshOnFocus: false });

  useFocusEffect(
    useCallback(() => {
      void load();
      // Back on Home, any "add more from Shop A" errand is over.
      useBasketGroupTarget.getState().clear();
      return () => {
        loadSequence.current++;
      };
    }, [load]),
  );

  // Coming back to the app on a new day is an open too.
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (next) => {
      if (next === "active") void useTesterProgram.getState().load(useSession.getState().user?.id ?? null);
    });
    return () => subscription.remove();
  }, []);

  const jobs = homeJobs(orders ?? []);
  const waiting = jobs.needsYou[0] ?? null;
  const previous = lastOrder(orders ?? []);
  const tile = summary || summaryFailed ? smartTileView(summary, user) : null;
  const seasonToday = davaoToday();
  const seasonBanner = seasonsHydrated ? bannersToShow(seasons, dismissedSeasons, seasonToday)[0] ?? null : null;
  const featured = samples ?? [];
  const showFeatured = samples === null || featured.length > 0;

  // The first-order tour starts here, once, for a client with nothing on press.
  useTourScreen("home");
  useTourAutoStart(orders !== null && orders.length === 0);

  const [searchOpen, setSearchOpen] = useState(false);
  const firstName = (user?.name ?? "").trim().split(/\s+/)[0];

  return (
    <TabScreen>
      {/*
        Keyboard-aware because Home takes typing: the search's results must
        not open behind the keyboard. The content is sized to the screen, so
        nothing scrolls unless the phone is too small to hold it.
      */}
      <KeyboardAwareScrollView
        className="gg-screen"
        contentContainerStyle={{ flexGrow: 1 }}
        bottomOffset={KEYBOARD_CARET_GAP}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={KEYBOARD_DISMISS}
      >
        <View className="gg-page flex-1 gap-3 pb-3 pt-2">
          <ScreenHeader>
            <GridgoLogo role={logoRoleForClientAccount(user?.accountType)} />
          </ScreenHeader>

          <TourTarget step="home.search">
            <HomeSearch
              categories={categories}
              placeholder={firstName ? `Hello ${firstName}, what are we printing?` : "What are we printing?"}
              onPick={(category, subcategory) => startJob(category.code, subcategory.code)}
              onOpenPicker={(query) =>
                router.push(query ? { pathname: "/request/category", params: { q: query } } : "/request/category")
              }
              onResultsChange={setSearchOpen}
            />
          </TourTarget>

          {searchOpen ? null : (
            <>
              {retiredDraft ? (
                <RetiredDraftNotice onDismiss={dismissRetiredDraft} />
              ) : waiting ? (
                <View className="gg-card-flush">
                  <HomeActionRow order={waiting} onPress={() => router.push(`/order/${waiting.id}`)} />
                  {jobs.needsYou.length > 1 ? (
                    <Pressable
                      onPress={() => router.navigate("/(tabs)/orders")}
                      accessibilityRole="button"
                      className="gg-touch justify-center border-t border-outline-subtle px-4"
                    >
                      <Text className="text-caption text-text-secondary">
                        {jobs.needsYou.length - 1} more {jobs.needsYou.length === 2 ? "job needs" : "jobs need"} you
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
              ) : seasonBanner ? (
                <SeasonBanner window={seasonBanner} today={seasonToday} onDismiss={() => dismissSeason(seasonBanner.id)} />
              ) : (
                <LegalNoticeBanner />
              )}

              <HomeTesterSlot />

              {showFeatured ? (
                <HomeFeaturedPrints
                  samples={featured}
                  loading={samples === null}
                  onPick={(sample) => startJob(sample.categoryCode, sample.subcategoryCode)}
                  onSeeAll={() => router.push("/request/category")}
                  onStalePhoto={onStalePhoto}
                />
              ) : (
                <View className="flex-1" />
              )}

              {categories.length ? (
                <TourTarget step="home.categories">
                  {/* Named like Featured prints above it, so Home reads as two sections. */}
                  <View className="gap-2 pt-1">
                    <Text className="text-h3 text-text-primary" accessibilityRole="header">
                      Shop by category
                    </Text>
                    <HomeCategoryCircles
                      categories={categories}
                      onPress={(category) => router.push(`/request/${category.code}`)}
                    />
                  </View>
                </TourTarget>
              ) : null}

              <View className="flex-row gap-3">
                <HomeSmartTile view={tile} onPress={(href) => router.push(href as Href)} />
                <HomeReorderTile title={previous?.title ?? null} onPress={() => previous && void reorder(previous)} />
              </View>
            </>
          )}
        </View>
      </KeyboardAwareScrollView>

    </TabScreen>
  );
}

/**
 * A drag dismisses the keyboard on a phone. On web, react-native-web treats
 * every scroll as a drag, so the field lost focus mid-word. A browser has no
 * soft keyboard to dismiss.
 */
const KEYBOARD_DISMISS = Platform.select({
  ios: "interactive",
  android: "on-drag",
  default: "none",
} as const);
