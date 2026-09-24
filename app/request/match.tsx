import { ChevronRight } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";

import { Screen } from "@/components/Screen";
import { EmptyState } from "@/components/EmptyState";
import { ErrorScreenState } from "@/components/ErrorState";
import { GridgoPrice, gridgoPriceLabel } from "@/components/GridgoPrice";
import { MatchCard } from "@/components/MatchCard";
import { MatchRankingRow } from "@/components/MatchRankingRow";
import { MatchingWait } from "@/components/MatchingWait";
import { PrimaryButton } from "@/components/PrimaryButton";
import { SamplePhoto } from "@/components/SamplePhoto";
import { useThemeColors } from "@/hooks/useTheme";
import * as api from "@/lib/api";
import { type CatalogItem, type MatchResult } from "@/lib/api";
import { formatDeadline } from "@/lib/deadline";
import { userFacingError } from "@/lib/copy";
import { printTimeLine, samplePhotoUri, unitLine } from "@/lib/listing";
import { matchDistanceMeters } from "@/lib/match";
import { clearMatchPrefetch, takeMatch } from "@/lib/matchPrefetch";
import { prefetchListing, rememberListing } from "@/lib/listingCache";
import { rememberOrderFlow } from "@/lib/orderFlow";
import { PRIORITIES_ROUTE } from "@/lib/priorities";
import { findCategory } from "@/lib/productCategories";
import { useCart } from "@/store/cart";
import { useJobDeadline } from "@/store/jobDeadline";
import { usePlatformSettings, useServiceFeeRateBps } from "@/store/platformSettings";
import { usePriorities } from "@/store/priorities";

/**
 * GRIDGO's answer for the thing the client wants printed.
 *
 * This is the screen the whole product turns on. Every other marketplace hands
 * a client a grid of shops and makes them do the comparing; GRIDGO already
 * asked what they care about, so it answers once, says which of their three
 * priorities decided it, and stops there.
 *
 * And the answer is GRIDGO's, not a shop's. The client walked up to GRIDGO's
 * counter; which press runs the job is GRIDGO's business to arrange and to
 * answer for. So no shop name and no shop address appears anywhere on this
 * screen — the matching still picks a real press, and the listings underneath
 * are really that press's board for the thing being printed, but the client
 * reads them as GRIDGO's.
 *
 * The matching is the platform's (`POST /me/matches`), so the queue and the
 * wait on the card are counted from jobs really in front of this one, and a
 * basket that already has a print run in it keeps the next job on that run
 * rather than splitting the order in two.
 */
export default function MatchScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const { subcategory, category } = useLocalSearchParams<{
    subcategory?: string;
    category?: string;
  }>();

  const ranking = usePriorities((state) => state.ranking);
  const cart = useCart((state) => state.cart);
  const dropoff = cart?.defaultDropoff ?? null;
  const dropoffKey =
    dropoff == null ? "" : `${dropoff.lat},${dropoff.lng}`;
  const deadline = useJobDeadline((state) => state.by);

  const [match, setMatch] = useState<MatchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  /** The soonest anyone could do it, when nobody can make the client's date. */
  const [earliest, setEarliest] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!subcategory) return;
    setLoading(true);
    try {
      // Read the basket at call time. Subscribing to `cartId` would rematch
      // the moment the listing sheet warms a cart — the client already has
      // an answer, and that second call is how "nobody can finish by then"
      // landed after they had already taken the pick.
      const { cartId, cart: liveCart } = useCart.getState();
      const result = await takeMatch({
        subcategoryCode: subcategory,
        dropoff: liveCart?.defaultDropoff ?? null,
        deadline,
        ...(cartId ? { cartId } : {}),
      });
      setMatch(result);
      setError(null);
    } catch (e) {
      const code =
        e instanceof api.ApiError ? (e.body as { error?: string })?.error : undefined;
      setEarliest(
        e instanceof api.ApiError
          ? ((e.body as { earliestAvailable?: string })?.earliestAvailable ?? null)
          : null,
      );
      setMatch(null);
      setError(
        // Distance ranked first with no pin: the matcher cannot answer, and the
        // client needs the address screen rather than an error about it. Held
        // as state and rendered as a redirect, so this loader stays free of the
        // router — depending on it would re-run the match on every render.
        code === "dropoff_required" || code === "match_not_found" || code === "deadline_not_met"
          ? code
          : userFacingError(
              e,
              "GRIDGO could not work out who prints this. Check your connection and try again.",
            ),
      );
    } finally {
      setLoading(false);
    }
    // `dropoffKey` is the pin, not the object: a cart hydrate that keeps the
    // same coordinates must not look like a new drop-off.
  }, [subcategory, dropoffKey, deadline]);

  // Deliberately not `useFocusEffect`: coming back from a listing sheet must
  // not re-run the match and quietly move the client to a different shop.
  useEffect(() => {
    // `loading` starts true, so the flag `load` raises on mount cannot
    // cascade a render; the async wrapper keeps the effect body itself free
    // of synchronous state writes.
    void (async () => {
      await load();
    })();
  }, [load]);

  // The run the client is on, so the step trail on every screen after this one
  // has a real shop to go back to rather than a guess.
  useEffect(() => {
    if (!subcategory || !category) return;
    rememberOrderFlow({ categoryCode: category, subcategoryCode: subcategory });
  }, [subcategory, category]);

  // GRIDGO's rate, so the listings can be priced as the client will pay them.
  // Held by the store after the first read; a failure keeps the rows waiting
  // rather than letting a shop's own figure through.
  const loadSettings = usePlatformSettings((state) => state.load);
  useEffect(() => {
    loadSettings().catch(() => {
      /* The rows stay on their skeleton; the sheet retries. */
    });
  }, [loadSettings]);

  const subcategoryName = useMemo(() => {
    const found = findCategory(api.productCategoriesNow(), category ?? "")?.subcategories.find(
      (entry) => entry.code === subcategory,
    );
    return found?.name ?? "this";
  }, [category, subcategory]);

  const openListing = useCallback(
    (item: CatalogItem) => {
      rememberListing(item);
      prefetchListing(item.id);
      // No shop name travels with the listing: the sheet it opens is
      // GRIDGO's, and the press behind it is GRIDGO's business.
      router.push({
        pathname: "/request/listing",
        params: { itemId: item.id },
      });
    },
    [router],
  );

  if (error === "dropoff_required") {
    return (
      <Redirect
        href={{
          pathname: "/request/where",
          params: { subcategory: subcategory ?? "", category: category ?? "" },
        }}
      />
    );
  }

  /*
    Nobody can make the date, which is a different answer from nobody printing
    this at all. A client told "we cannot do this" would go elsewhere; a client
    told "not by Friday, but by Tuesday" has a decision to make.
  */
  if (error === "deadline_not_met") {
    return (
      <Screen edges={["bottom"]}>
        <View className="gg-screen gg-page justify-center">
          <EmptyState
            title={`Nobody can finish ${subcategoryName.toLowerCase()} by then`}
            body={
              earliest
                ? `The soonest anyone can do it is ${formatDeadline(earliest)}. Change your date and GRIDGO will look again.`
                : "Change your date and GRIDGO will look again."
            }
            actionLabel="Change my date"
            onAction={() => {
              clearMatchPrefetch();
              if (router.canGoBack()) {
                router.back();
                return;
              }
              router.replace({
                pathname: "/request/when",
                params: { subcategory: subcategory ?? "", category: category ?? "" },
              });
            }}
          />
        </View>
      </Screen>
    );
  }

  if (error === "match_not_found") {
    return (
      <Screen edges={["bottom"]}>
        <View className="gg-screen gg-page justify-center">
          <EmptyState
            title={`GRIDGO cannot print ${subcategoryName.toLowerCase()} today`}
            body="Nothing on GRIDGO's presses covers this one right now. Operations can still quote it with you — or pick something else to print."
            actionLabel="Choose something else"
            onAction={() => router.back()}
          />
        </View>
      </Screen>
    );
  }

  if (error) {
    return (
      <Screen edges={["bottom"]}>
        <ErrorScreenState
          label="GRIDGO could not answer"
          body={error}
          onRetry={() => void load()}
        />
      </Screen>
    );
  }

  /*
    The wait.

    Skeleton shapes are the right language for a list that is about to appear
    in the same arrangement. They were the wrong one here: what lands is a
    single card whose whole content is a decision, and a grey rectangle
    standing in for a decision says nothing at all. So this moment is drawn
    rather than blanked — see `components/MatchingWait.tsx`.

    The heading and the ranking row are the same elements the loaded screen
    opens with, in the same order, so nothing above the fold moves when the
    match lands. The wait takes the room the card is about to take and centres
    in it — hung under the header instead, it sat in the top third with a
    phone's worth of empty canvas below it.
  */
  if (loading || !match) {
    return (
      <Screen edges={["bottom"]}>
        <View className="gg-page flex-1 pt-2">
          <Text className="text-h1 text-text-primary">
            Your {subcategoryName.toLowerCase()}
          </Text>

          <View className="mt-4">
            <MatchRankingRow
              ranking={ranking}
              onChange={() =>
                router.push({ pathname: PRIORITIES_ROUTE, params: { returnTo: "match" } })
              }
            />
          </View>

          <View className="flex-1 justify-center">
            <MatchingWait thing={subcategoryName} />
          </View>
        </View>
      </Screen>
    );
  }

  return (
    <Screen edges={["bottom"]}>
      <ScrollView className="gg-screen" contentContainerClassName="gg-page pb-16 pt-2">
        <Text className="text-h1 text-text-primary">
          Your {subcategoryName.toLowerCase()}
        </Text>

        {/*
          The ranking said out loud, next to the match it produced. A client who
          disagrees with the pick is really disagreeing with their own order,
          and this is the shortest path from one to the other. `returnTo` puts
          them back here rather than on Home — they came to read a match.
        */}
        <View className="mt-4">
          <MatchRankingRow
            ranking={ranking}
            onChange={() =>
              router.push({ pathname: PRIORITIES_ROUTE, params: { returnTo: "match" } })
            }
          />
        </View>

        <View className="mt-6">
          <MatchCard
            match={match}
            subcategoryName={subcategoryName}
            distanceMeters={matchDistanceMeters(match, dropoff)}
          />
        </View>

        <View className="mt-8 gap-3">
          <Text className="text-overline text-text-muted">
            {match.listings.length === 1
              ? `1 ${subcategoryName.toUpperCase()} LISTING`
              : `${match.listings.length} ${subcategoryName.toUpperCase()} LISTINGS`}
          </Text>
          {match.listings.map((item) => (
            <ListingRow
              key={item.id}
              item={item}
              onPress={() => openListing(item)}
            />
          ))}
        </View>

        {!dropoff ? (
          <Text className="mt-6 text-caption text-text-muted">
            GRIDGO works out delivery once you set the address at checkout.
          </Text>
        ) : null}
      </ScrollView>

      <View className="gg-page gap-3 pb-2 pt-2">
        <PrimaryButton
          label="Continue"
          onPress={() => {
            const first = match.listings[0];
            if (first) openListing(first);
          }}
          disabled={match.listings.length === 0}
        />
      </View>
    </Screen>
  );
}

/**
 * One thing GRIDGO can print for this job.
 *
 * The sample leads, because it is real work off the press that would run this
 * and it is what a client reads first. "From" appears only when a step can push
 * the price up — a fixed price that says "from" is a price nobody trusts. The
 * figure is GRIDGO's price, never the shop's: what the shop typed is what the
 * shop is paid, and a client is buying from GRIDGO.
 */
function ListingRow({ item, onPress }: { item: CatalogItem; onPress: () => void }) {
  const colors = useThemeColors();
  const rate = useServiceFeeRateBps();
  const pressTime = printTimeLine(item.turnaroundHours);
  const from = item.fromPriceMinor !== item.basePriceMinor ? "From " : "";

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${item.name}, ${from.toLowerCase()}${gridgoPriceLabel(item.fromPriceMinor, rate)} ${unitLine(item)}`}
      className="gg-card-flush flex-row items-center gap-3 p-3"
    >
      {({ pressed }) => (
        <>
          <View className="w-20">
            <SamplePhoto
              url={samplePhotoUri(item.photos[0])}
              altText={item.photos[0]?.altText ?? item.name}
              gutter="tight"
              emptyLabel="No sample"
            />
          </View>
          <View className="min-w-0 flex-1 gap-1">
            <Text className="text-body-lg font-medium text-text-primary">{item.name}</Text>
            <GridgoPrice
              supplierMinor={item.fromPriceMinor}
              prefix={from}
              suffix={` ${unitLine(item)}`}
              className="text-body text-text-secondary"
            />
            {pressTime ? <Text className="text-caption text-text-muted">{pressTime}</Text> : null}
          </View>
          <ChevronRight size={18} color={colors.textMuted} strokeWidth={2} />
          {pressed ? (
            <View pointerEvents="none" className="gg-pressed absolute inset-0" />
          ) : null}
        </>
      )}
    </Pressable>
  );
}
