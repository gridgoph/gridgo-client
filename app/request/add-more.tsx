import { TriangleAlert } from "lucide-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { EmptyState } from "@/components/EmptyState";
import { ErrorScreenState } from "@/components/ErrorState";
import { LoadingOverlay } from "@/components/LoadingOverlay";
import { OtherListingRow } from "@/components/OtherListingRow";
import { Screen } from "@/components/Screen";
import { SkeletonBlock, SkeletonLine } from "@/components/Skeleton";
import { useLiveRefresh } from "@/hooks/useLiveRefresh";
import { usePhotoLinkRefresh } from "@/hooks/usePhotoLinkRefresh";
import { useThemeColors } from "@/hooks/useTheme";
import * as api from "@/lib/api";
import type { CartGroupListings, OtherListing } from "@/lib/api";
import { groupDateLine } from "@/lib/basketGroups";
import { userFacingError } from "@/lib/copy";
import {
  groupListingsEmpty,
  groupPickGone,
  groupPickInput,
  pickedFromGroupMatch,
} from "@/lib/groupListings";
import { prefetchListing, rememberListing } from "@/lib/listingCache";
import { hasFullSheet, sheetListing } from "@/lib/match";
import { clearMatchPrefetch } from "@/lib/matchPrefetch";
import { holdMatchSelection } from "@/lib/matchSelection";
import { rememberOrderFlow } from "@/lib/orderFlow";
import { fulfilmentStepFor } from "@/lib/requestFulfilment";
import { useBasketGroupTarget } from "@/store/basketGroup";
import { useCart } from "@/store/cart";
import { useJobDeadline } from "@/store/jobDeadline";
import { useJobFulfilment, withJobFulfilment } from "@/store/jobFulfilment";
import { usePlatformSettings } from "@/store/platformSettings";

/**
 * "Add more from Shop A for Sat 14 Nov" (report C86B13A1, gridgo-client#267).
 *
 * Checkout's add-more control used to open the category picker, and the client
 * had to guess what the shop behind Shop A prints. A wrong guess ended on
 * "Shop A cannot print this". This screen lists what that group can really
 * take instead — its shop's orderable products that still fit the group's date
 * — as the same anonymous GRIDGO listing rows the match screen draws, priced
 * at GRIDGO's figures. No shop name, address or logo reaches it: the read
 * carries none (`lib/groupListings.ts`).
 *
 * Tapping a product matches it to the group (`groupId`, the group's own date)
 * and opens its order sheet with that pick's token, so "Add to my order" puts
 * it in the same group, on the same date, in the same delivery.
 */
export default function AddMoreScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const groupId = useBasketGroupTarget((state) => state.groupId);
  const targetLabel = useBasketGroupTarget((state) => state.label);
  const targetDeadline = useBasketGroupTarget((state) => state.deadline);
  const cartId = useCart((state) => state.cartId);

  const [group, setGroup] = useState<CartGroupListings | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** The product being matched to the group, while that runs. */
  const [picking, setPicking] = useState<OtherListing | null>(null);
  /** Why the last tap did not open a sheet. */
  const [notice, setNotice] = useState<string | null>(null);

  const loadSequence = useRef(0);
  /** The list on screen, so a failed refresh can keep it rather than blank it. */
  const shown = useRef<CartGroupListings | null>(null);
  const load = useCallback(async (): Promise<CartGroupListings | null> => {
    if (!cartId || !groupId) return null;
    const sequence = ++loadSequence.current;
    try {
      const read = await api.getCartGroupListings(cartId, groupId);
      if (sequence !== loadSequence.current) return null;
      shown.current = read;
      setGroup(read);
      setError(null);
      return read;
    } catch (e) {
      if (sequence !== loadSequence.current) return null;
      // A refresh that fails keeps the list already on screen.
      if (!shown.current) {
        setError(userFacingError(e, "GRIDGO could not load this shop's products. Try again."));
      }
      return null;
    }
  }, [cartId, groupId]);

  // On focus too: coming back from a sheet the client did not add from reads
  // the list again, since a queue or a listing may have moved meanwhile.
  useLiveRefresh(["catalog", "services"], load);

  const listings = group?.listings ?? null;
  const onStalePhoto = usePhotoLinkRefresh(
    listings,
    useCallback(async () => (await load())?.listings ?? null, [load]),
  );

  // GRIDGO's rate, for any row on an older payload without client figures.
  const loadSettings = usePlatformSettings((state) => state.load);
  useEffect(() => {
    loadSettings().catch(() => {
      /* The prices wait on their skeleton. */
    });
  }, [loadSettings]);

  // Checkout's name for the group wins: a one-shop basket never showed its
  // letter, so there it is "this shop" even though GRIDGO calls it Shop A.
  const label = targetLabel ?? group?.label ?? "this shop";
  const deadline = group ? group.deadline : targetDeadline;

  const pick = async (card: OtherListing) => {
    if (picking || !cartId || !groupId) return;
    setPicking(card);
    setNotice(null);
    try {
      const cart = useCart.getState().cart;
      // The product joins this group: its date, and the way the basket travels.
      useJobDeadline.getState().set(deadline ?? null);
      useJobFulfilment
        .getState()
        .set(fulfilmentStepFor(cart) === "locked" ? (cart?.requestFulfillment ?? null) : null);
      clearMatchPrefetch();
      const match = await api.matchShop(
        withJobFulfilment(
          groupPickInput(cartId, groupId, card.subcategoryCode),
          cart?.defaultDropoff ?? null,
        ),
      );
      const found = pickedFromGroupMatch(match, card.id);
      if (!found?.selectToken || !match.matchRequestId) {
        setNotice(groupPickGone(card.name, label));
        await load();
        return;
      }
      holdMatchSelection(found.id, {
        matchRequestId: match.matchRequestId,
        selectToken: found.selectToken,
        expiresAt: match.selectTokenExpiresAt ?? null,
      });
      rememberListing(sheetListing(found), { partial: !hasFullSheet(found) });
      prefetchListing(found.id);
      rememberOrderFlow({ categoryCode: card.categoryCode, subcategoryCode: card.subcategoryCode });
      router.push({ pathname: "/request/listing", params: { itemId: found.id } });
    } catch (e) {
      const code = e instanceof api.ApiError ? (e.body as { error?: string } | null)?.error : undefined;
      if (code === "match_not_found" || code === "deadline_not_met") {
        setNotice(groupPickGone(card.name, label));
        await load();
        return;
      }
      setNotice(userFacingError(e, `GRIDGO could not open ${card.name}. Try again.`));
    } finally {
      setPicking(null);
    }
  };

  /** Anything at all, matched across every shop: it may become its own group. */
  const everyShop = () => {
    useBasketGroupTarget.getState().clear();
    router.push("/request/category");
  };

  const backToCheckout = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/checkout");
  };

  if (!cartId || !groupId) {
    return (
      <Screen edges={["bottom"]}>
        <View className="gg-screen gg-page justify-center">
          <EmptyState
            title="Open this from your order"
            body="Adding more from one shop starts at checkout, under that shop's items."
            actionLabel="Go to checkout"
            onAction={() => router.replace("/checkout")}
          />
        </View>
      </Screen>
    );
  }

  if (error && !group) {
    return (
      <Screen edges={["bottom"]}>
        <ErrorScreenState
          label="These products did not load"
          body={error}
          onRetry={() => {
            setError(null);
            void load();
          }}
        />
      </Screen>
    );
  }

  if (group && group.listings.length === 0) {
    const empty = groupListingsEmpty(group.emptyReason, label, deadline);
    return (
      <Screen edges={["bottom"]}>
        <View className="gg-screen gg-page justify-center">
          <EmptyState
            title={empty.title}
            body={empty.body}
            actionLabel="Back to checkout"
            onAction={backToCheckout}
            altActionLabel="Choose from every shop"
            onAltAction={everyShop}
          />
        </View>
      </Screen>
    );
  }

  return (
    <Screen edges={["bottom"]}>
      <ScrollView className="gg-screen" contentContainerClassName="gg-page pb-8 pt-2">
        <Text className="text-h2 text-text-primary">More from {label}</Text>
        <Text className="mt-1 text-body text-text-secondary">
          {groupDateLine(deadline)}. Anything you add here goes out with {label}&apos;s delivery, at
          no extra delivery fee.
        </Text>

        {notice ? (
          <View
            className="gg-panel mt-4 flex-row gap-3"
            accessible
            accessibilityRole="alert"
            accessibilityLabel={notice}
          >
            <TriangleAlert size={20} color={colors.warning} strokeWidth={2} aria-hidden />
            <Text className="min-w-0 flex-1 text-body text-text-primary">{notice}</Text>
          </View>
        ) : null}

        <View className="mt-6 gap-3">
          {group
            ? group.listings.map((listing) => (
                <OtherListingRow
                  key={listing.id}
                  listing={listing}
                  showPlace={false}
                  onPress={() => void pick(listing)}
                  onStalePhoto={onStalePhoto}
                />
              ))
            : [0, 1, 2].map((row) => <SkeletonRow key={row} />)}
        </View>

        {group ? (
          <View className="mt-8 gap-1">
            <Text className="text-caption text-text-muted">
              Need something {label} does not offer? Another shop sends it as its own group, with
              its own delivery fee.
            </Text>
            <Pressable
              onPress={everyShop}
              accessibilityRole="button"
              accessibilityLabel="Choose from every shop"
              className="gg-touch self-start justify-center"
              style={({ pressed }) => (pressed ? { opacity: 0.6 } : undefined)}
            >
              <Text className="text-button text-text-primary underline">Choose from every shop</Text>
            </Pressable>
          </View>
        ) : null}
      </ScrollView>

      <LoadingOverlay
        visible={picking != null}
        label={`Opening ${picking?.name ?? "this product"}`}
        body={`Checking ${label} can still make it for this date.`}
      />
    </Screen>
  );
}

/** A listing row that has not arrived yet, the same height as the real one. */
function SkeletonRow() {
  return (
    <View aria-hidden className="gg-card-flush flex-row items-center gap-3 p-3">
      <SkeletonBlock className="h-20 w-20 rounded-field" />
      <View className="min-w-0 flex-1 gap-2">
        <SkeletonLine width="w-2/3" height="h-5" />
        <SkeletonLine width="w-1/2" height="h-4" />
        <SkeletonLine width="w-1/3" height="h-3" />
      </View>
    </View>
  );
}
