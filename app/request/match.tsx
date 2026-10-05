import { TriangleAlert } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { Redirect, useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";

import { ConfirmDialog } from "@/components/ConfirmDialog";
import { EmptyState } from "@/components/EmptyState";
import { ErrorScreenState } from "@/components/ErrorState";
import { MatchRankingRow } from "@/components/MatchRankingRow";
import { MatchingWait } from "@/components/MatchingWait";
import { OtherListingRow } from "@/components/OtherListingRow";
import { PrimaryButton } from "@/components/PrimaryButton";
import { Screen } from "@/components/Screen";
import { SecondaryButton } from "@/components/SecondaryButton";
import { TopPickCard } from "@/components/TopPickCard";
import { TourTarget } from "@/components/TourTarget";
import { usePhotoLinkRefresh } from "@/hooks/usePhotoLinkRefresh";
import { needsDropoffFirst } from "@/hooks/useStartPrintJob";
import { useThemeColors } from "@/hooks/useTheme";
import { useTourScreen } from "@/hooks/useTourScreen";
import * as api from "@/lib/api";
import { type MatchResult } from "@/lib/api";
import { userFacingError } from "@/lib/copy";
import { formatDeadline } from "@/lib/deadline";
import { OUT_OF_ZONE_QUESTION, isOutOfZone, outOfZoneWarning } from "@/lib/distanceZone";
import { prefetchListing, rememberListing } from "@/lib/listingCache";
import {
  hasFullSheet,
  matchedRanking,
  otherListingsOf,
  sheetListing,
  topPickListing,
  type PickableListing,
} from "@/lib/match";
import { clearMatchPrefetch, takeMatch } from "@/lib/matchPrefetch";
import { holdMatchSelection, matchAgedOut, matchIsSpent } from "@/lib/matchSelection";
import { REMATCH_MINIMUM_MS, withMinimumWait } from "@/lib/minimumWait";
import { rememberOrderFlow } from "@/lib/orderFlow";
import { withFreshPhotos } from "@/lib/photoLinks";
import { findCategory } from "@/lib/productCategories";
import { fulfilmentSummary, pickupMatchView } from "@/lib/requestFulfilment";
import { HOME_TAB } from "@/lib/receipt";
import { useCart } from "@/store/cart";
import { useJobDeadline } from "@/store/jobDeadline";
import { useJobFulfilment, withJobFulfilment } from "@/store/jobFulfilment";
import { useJobRanking, withJobRanking } from "@/store/orderRanking";
import { usePlatformSettings } from "@/store/platformSettings";

/**
 * GRIDGO's answer for the thing the client wants printed
 * (gridgoph/gridgo-client#154, #155, #157).
 *
 * This is the screen the whole product turns on. Every other marketplace hands
 * a client a grid of shops and makes them do the comparing; GRIDGO already
 * asked what they care about, in order, so it leads with one Top Pick and says
 * which of their priorities decided it. Underneath sit the other listings that
 * can make the same date — one from every other shop GRIDGO could put the job
 * on — for a client who would rather take a shorter queue or a lower price.
 *
 * And the answer is GRIDGO's, not a shop's. The client walked up to GRIDGO's
 * counter; which press runs the job is GRIDGO's business to arrange and to
 * answer for. So no shop name, address, logo or contact appears anywhere on
 * this screen. Other shops' listings arrive from the API with no shop on them
 * at all, and each is picked by an opaque token (`lib/matchSelection.ts`)
 * rather than by anything that would say whose it is.
 *
 * "Change" re-ranks this job only (`app/request/rank.tsx`). Coming back with a
 * new order holds "GRIDGO is finding a printer" for a fixed three seconds
 * before the new answer lands, however fast the match was (#155).
 */
export default function MatchScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const { subcategory, category } = useLocalSearchParams<{
    subcategory?: string;
    category?: string;
  }>();

  // The order this job is matched on: its own re-rank, else the usual one.
  const asked = useJobRanking();
  // The order, not the array: a re-read that keeps the same order must not
  // look like a new one. A changed order is a new question, so it rematches.
  const rankingKey = asked?.join(",") ?? "";
  const cart = useCart((state) => state.cart);
  const dropoff = cart?.defaultDropoff ?? null;
  // Delivery or pick-up, when this job chose before matching (#158). Its point
  // is what the match is measured from, so a different one is a new question.
  const fulfilment = useJobFulfilment((state) => state.choice);
  const point = fulfilment ? fulfilment.dropoff : dropoff;
  const dropoffKey = `${fulfilment?.fulfillmentMode ?? ""}:${point == null ? "" : `${point.lat},${point.lng}`}`;
  const deadline = useJobDeadline((state) => state.by);

  const [match, setMatch] = useState<MatchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  /** The soonest anyone could do it, when nobody can make the client's date. */
  const [earliest, setEarliest] = useState<string | null>(null);
  /** The ranking the last match was asked with, to tell a change from a first match. */
  const askedFor = useRef<string | null>(null);
  /** When the answer on screen arrived, by this phone's clock. */
  const [receivedAt, setReceivedAt] = useState(0);
  const loadSequence = useRef(0);

  const load = useCallback(async () => {
    if (!subcategory) return;
    const sequence = ++loadSequence.current;
    // A new order from Change is the one rematch the client asked for, and it
    // holds the wait for its fixed minimum. A first match, or one after the
    // drop-off moved, lands as soon as GRIDGO answers.
    const paced = askedFor.current != null && askedFor.current !== rankingKey;
    askedFor.current = rankingKey;
    // Read the basket at call time. Subscribing to it would rematch the
    // moment the listing sheet warms a cart — the client already has an
    // answer. No `cartId`: a pick token bound to this basket would be
    // refused by the fresh one "start a new order" makes.
    const { cart: liveCart } = useCart.getState();
    // Re-ranked to distance first with nowhere to measure from: GRIDGO would
    // refuse, so go straight to the address rather than waiting to be told.
    if (needsDropoffFirst(liveCart?.defaultDropoff ?? null)) {
      setError("dropoff_required");
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const request = takeMatch(
        withJobRanking(
          withJobFulfilment(
            { subcategoryCode: subcategory, deadline },
            liveCart?.defaultDropoff ?? null,
          ),
        ),
      );
      const result = paced ? await withMinimumWait(request, REMATCH_MINIMUM_MS) : await request;
      if (sequence !== loadSequence.current) return;
      setMatch(
        useJobFulfilment.getState().choice?.fulfillmentMode === "pickup" ? pickupMatchView(result) : result,
      );
      setReceivedAt(Date.now());
      setError(null);
    } catch (e) {
      if (sequence !== loadSequence.current) return;
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
      if (sequence === loadSequence.current) setLoading(false);
    }
    // `dropoffKey` is the pin, not the object: a cart hydrate that keeps the
    // same coordinates must not look like a new drop-off. `rankingKey` is read
    // through `withJobRanking`; it is here because a changed order rematches.
  }, [subcategory, dropoffKey, deadline, rankingKey]);

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

  /*
    The one exception to not rematching on focus: picks that can no longer be
    taken. Every token in a match lives fifteen minutes, so a client coming
    back after that — or sent back by the order sheet because one ran out —
    would otherwise tap a listing GRIDGO will refuse. The held answer is spent;
    asking again is the honest thing. Its age is counted on this phone's clock
    (`matchAgedOut`), so a phone running fast cannot rematch in a loop.
  */
  useFocusEffect(
    useCallback(() => {
      // Not while a match is already on its way: asking again would cancel it,
      // and with it the three-second hold a Change is owed.
      if (
        loading ||
        !match ||
        (!matchAgedOut(receivedAt) && !matchIsSpent(match.matchRequestId))
      ) {
        return;
      }
      clearMatchPrefetch();
      void load();
    }, [loading, match, receivedAt, load]),
  );

  /*
    The listings' photo links expire five minutes after the match. Renewing
    them re-reads each listing's board and swaps in its photos only — never the
    match itself, which would quietly move the client to another shop.
  */
  const heldListings = useMemo(
    () => (match ? [...match.listings, ...(match.otherListings ?? [])] : null),
    [match],
  );
  const rereadPhotos = useCallback(async () => {
    const held = match;
    if (!held) return null;
    // Listing by listing, never the Top Pick's whole board: that read is
    // keyed by the shop, and the match must not need to know whose it is.
    const reads = await Promise.all(
      [...held.listings, ...(held.otherListings ?? [])].map((listing) =>
        api.getCatalogItem(listing.id).catch(() => null),
      ),
    );
    const fresh = reads.filter((listing): listing is api.CatalogItem => listing != null);
    if (!fresh.length) throw new Error("GRIDGO could not renew these photos.");
    const renewed: MatchResult = {
      ...held,
      listings: withFreshPhotos(held.listings, fresh),
      ...(held.otherListings ? { otherListings: withFreshPhotos(held.otherListings, fresh) } : {}),
    };
    setMatch((current) => (current === held ? renewed : current));
    return fresh;
  }, [match]);
  const onStalePhoto = usePhotoLinkRefresh(heldListings, rereadPhotos);

  // The run the client is on, so the step trail on every screen after this one
  // has a real job to go back to rather than a guess.
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

  const topPick = match ? topPickListing(match) : null;
  useTourScreen("match", !loading && !error && topPick != null);

  const subcategoryName = useMemo(() => {
    const found = findCategory(api.productCategoriesNow(), category ?? "")?.subcategories.find(
      (entry) => entry.code === subcategory,
    );
    return found?.name ?? "this";
  }, [category, subcategory]);

  const settings = usePlatformSettings((state) => state.settings);
  /** An Out of Zone listing the client tapped, waiting on the warning. */
  const [farListing, setFarListing] = useState<PickableListing | null>(null);

  const openListing = useCallback(
    (item: PickableListing) => {
      setFarListing(null);
      // The pick travels as its token, so the sheet's add names this listing
      // without anything on the client's side saying whose it is.
      if (match?.matchRequestId && item.selectToken) {
        holdMatchSelection(item.id, {
          matchRequestId: match.matchRequestId,
          selectToken: item.selectToken,
          expiresAt: match.selectTokenExpiresAt ?? null,
        });
      }
      rememberListing(sheetListing(item), { partial: !hasFullSheet(item) });
      prefetchListing(item.id);
      // No shop name travels with the listing: the sheet it opens is
      // GRIDGO's, and the press behind it is GRIDGO's business.
      router.push({
        pathname: "/request/listing",
        params: { itemId: item.id },
      });
    },
    [match, router],
  );

  /*
    Choosing a listing. An Out of Zone shop is priced per kilometre for
    delivery, which can cost far more than the three zones' flat fees — so the
    client hears that before the listing opens, not at checkout (#156). It is a
    warning, never a gate: "Choose this listing" goes on exactly as a nearer
    one would.
  */
  const chooseListing = useCallback(
    (item: PickableListing) => {
      // A pick-up is collected at GRIDGO Office for a flat fee, so how far the
      // press is from the hub costs the client nothing.
      if (useJobFulfilment.getState().choice?.fulfillmentMode !== "pickup" && isOutOfZone(item.distanceZone)) {
        setFarListing(item);
        return;
      }
      openListing(item);
    },
    [openListing],
  );

  const changeRanking = useCallback(() => {
    router.push({
      pathname: "/request/rank",
      params: { subcategory: subcategory ?? "", category: category ?? "", returnTo: "match" },
    });
  }, [router, subcategory, category]);

  // Nothing is in the basket yet, so cancelling loses nothing: the client goes
  // back Home, not one screen up the flow. `dismissTo` replaces this screen
  // when Home is not under it (a deep link).
  const cancel = useCallback(() => {
    router.dismissTo(HOME_TAB);
  }, [router]);

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
              // Past the ranking step, straight to the date that ruled
              // everyone out.
              router.dismissTo({
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
            onAction={() => router.dismissTo("/request/category")}
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
    single pick whose whole content is a decision, and a grey rectangle
    standing in for a decision says nothing at all. So this moment is drawn
    rather than blanked — see `components/MatchingWait.tsx`.

    The ranking row is the same element the loaded screen opens with, so
    nothing above the fold moves when the match lands — and after Change it
    already shows the new order while GRIDGO looks.
  */
  if (loading || !match || !topPick) {
    return (
      <Screen edges={["bottom"]}>
        <View className="gg-page flex-1 pt-2">
          <MatchRankingRow ranking={asked} onChange={changeRanking} />

          <View className="flex-1 justify-center">
            <MatchingWait thing={subcategoryName} />
          </View>
        </View>
      </Screen>
    );
  }

  const others = otherListingsOf(match);

  return (
    <Screen edges={["bottom"]}>
      <ScrollView className="gg-screen" contentContainerClassName="gg-page pb-8 pt-2">
        {/*
          The ranking said out loud, next to the match it produced. A client who
          disagrees with the pick is really disagreeing with their own order,
          and this is the shortest path from one to the other.
        */}
        <MatchRankingRow ranking={matchedRanking(match, asked)} onChange={changeRanking} />

        <View className="mt-4">
          <TopPickCard
            match={match}
            listing={topPick}
            onPress={() => chooseListing(topPick)}
            onStalePhoto={onStalePhoto}
          />
        </View>

        {others.length ? (
          <View className="mt-8 gap-3">
            <Text className="text-overline font-bold text-text-primary">
              OTHER LISTINGS FOR THIS DAY
            </Text>
            {others.map((item) => (
              <OtherListingRow
                key={item.id}
                listing={item}
                onPress={() => chooseListing(item)}
                onStalePhoto={onStalePhoto}
              />
            ))}
          </View>
        ) : null}

        {fulfilment ? (
          <Text className="mt-6 text-caption text-text-muted">
            {fulfilmentSummary(fulfilment)}.{" "}
            {fulfilment.fulfillmentMode === "pickup"
              ? "Collection hours are on your order."
              : "Delivery is charged by zone at checkout."}
          </Text>
        ) : !dropoff ? (
          <Text className="mt-6 text-caption text-text-muted">
            GRIDGO works out delivery once you set the address at checkout.
          </Text>
        ) : null}
      </ScrollView>

      <View className="gg-page flex-row gap-3 pb-2 pt-2">
        <View className="flex-1">
          <SecondaryButton label="Cancel" onPress={cancel} />
        </View>
        {/* The tour lights Proceed: the pick fills the first screen and the
            other listings sit below it, so this is the one control always in
            view. */}
        <TourTarget step="match" className="flex-1">
          <PrimaryButton label="Proceed" onPress={() => chooseListing(topPick)} />
        </TourTarget>
      </View>

      <ConfirmDialog
        visible={farListing != null}
        leading={<TriangleAlert size={24} color={colors.warning} strokeWidth={2} />}
        question={OUT_OF_ZONE_QUESTION}
        body={outOfZoneWarning({ distanceKm: farListing?.distanceKm, settings })}
        confirmLabel="Choose this listing"
        cancelLabel="Pick another listing"
        onConfirm={() => {
          if (farListing) openListing(farListing);
        }}
        onCancel={() => setFarListing(null)}
      />
    </Screen>
  );
}
