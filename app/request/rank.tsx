import { Check, CircleAlert, RotateCcw } from "lucide-react-native";
import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import Animated from "react-native-reanimated";

import { PrimaryButton } from "@/components/PrimaryButton";
import { PRIORITY_CARD_MOVE, PriorityCard } from "@/components/PriorityCard";
import { Screen } from "@/components/Screen";
import { SecondaryButton } from "@/components/SecondaryButton";
import { needsDropoffFirst } from "@/hooks/useStartPrintJob";
import { useThemeColors } from "@/hooks/useTheme";
import { prefetchMatch } from "@/lib/matchPrefetch";
import {
  displayOrder,
  isCompleteRanking,
  rankOf,
  rankingSentence,
  sameRanking,
  togglePlacement,
  type Priority,
  type PriorityRanking,
} from "@/lib/priorities";
import { useCart } from "@/store/cart";
import { useJobDeadline } from "@/store/jobDeadline";
import { useOrderRanking, withJobRanking } from "@/store/orderRanking";
import { usePriorities } from "@/store/priorities";

/** GRIDGO's own order when an account has none saved — what the API matches on. */
const PLATFORM_DEFAULT: PriorityRanking = ["quality", "speed", "cost", "distance"];

/**
 * Confirm or re-rank what GRIDGO matches this job on
 * (gridgoph/gridgo-client#157).
 *
 * A client puts quality, speed, cost and distance in order once, at
 * onboarding, and that order is their default. Each job then asks whether it
 * still holds: a rush job may want speed first where the usual order puts
 * quality there. The usual order is already on the cards, so confirming is one
 * tap, and the whole step can be skipped — the match then simply runs on the
 * saved order.
 *
 * A re-rank belongs to this job (`store/orderRanking.ts`) and is sent with its
 * match; it does not move the usual order unless the client ticks "Also make
 * this my usual order", which saves through the same `PUT /me/preferences` the
 * Matching screen in Settings uses.
 *
 * The same screen is what "Change" opens on the match (`returnTo=match`).
 * There, finishing goes back to the match, which holds "GRIDGO is finding a
 * printer" for its minimum and shows the new answer; Cancel leaves the match
 * as it was.
 */
export default function JobRankingScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const { subcategory, category, returnTo } = useLocalSearchParams<{
    subcategory?: string;
    category?: string;
    returnTo?: string;
  }>();
  const changing = returnTo === "match";

  const usual = usePriorities((state) => state.ranking);
  const saveUsual = usePriorities((state) => state.save);
  const saving = usePriorities((state) => state.saving);
  const saveError = usePriorities((state) => state.saveError);
  const clearSaveError = usePriorities((state) => state.clearSaveError);
  const jobRanking = useOrderRanking((state) => state.ranking);
  const setJobRanking = useOrderRanking((state) => state.set);

  // What this job matches on as the screen opens: an earlier re-rank of it,
  // else the usual order. Never blank — a client confirming should not have
  // to rebuild an order they already chose.
  const [current] = useState<PriorityRanking>(() => jobRanking ?? usual ?? PLATFORM_DEFAULT);
  const [order, setOrder] = useState<Priority[]>(() => [...current]);
  const [makeUsual, setMakeUsual] = useState(false);

  const complete = isCompleteRanking(order);
  const usualOrder = usual ?? PLATFORM_DEFAULT;
  const differsFromUsual = complete && !sameRanking(order, usualOrder);
  const unchanged = complete && sameRanking(order, current);

  const place = (priority: Priority) => {
    // Functional update: several quick taps all read the same render's order.
    setOrder((now) => togglePlacement(now, priority));
    if (saveError) clearSaveError();
  };

  /** On to the match — or the address first, when distance now leads without one. */
  const continueToMatch = () => {
    const dropoff = useCart.getState().cart?.defaultDropoff ?? null;
    const needsDropoff = needsDropoffFirst(dropoff);
    if (!needsDropoff && subcategory) {
      prefetchMatch(
        withJobRanking({
          subcategoryCode: subcategory,
          dropoff,
          deadline: useJobDeadline.getState().by,
        }),
      );
    }
    router.push({
      pathname: needsDropoff ? "/request/where" : "/request/match",
      params: { subcategory: subcategory ?? "", category: category ?? "" },
    });
  };

  const finish = () => {
    if (changing) {
      router.back();
      return;
    }
    continueToMatch();
  };

  const confirm = async () => {
    if (!isCompleteRanking(order) || saving) return;
    if (makeUsual && differsFromUsual) {
      // Saved first, so the match that follows reads the new usual order. A
      // refusal stops here with the reason on screen rather than matching on
      // an order the client was told was kept.
      const kept = await saveUsual(order);
      if (!kept) return;
      setJobRanking(null);
      finish();
      return;
    }
    // The usual order needs nothing sent: GRIDGO already holds it.
    setJobRanking(sameRanking(order, usualOrder) ? null : order);
    finish();
  };

  const skip = () => {
    setJobRanking(null);
    continueToMatch();
  };

  const primaryLabel = saving
    ? "Saving…"
    : !complete
      ? "Rank all four"
      : changing
        ? unchanged
          ? "Keep this order"
          : "Match again"
        : "Find my printer";

  return (
    <Screen edges={["bottom"]}>
      <ScrollView className="gg-screen" contentContainerClassName="gg-page pb-6 pt-2">
        <Text className="text-h2 text-text-primary">What matters most for this job?</Text>
        <Text className="mt-2 text-body-lg text-text-secondary">
          {changing
            ? "Tap to re-rank and GRIDGO matches this job again. Your usual order stays as it is."
            : "This is your usual order. Keep it, or tap to re-rank for this job only."}
        </Text>

        <View className="mt-6 gap-3">
          {displayOrder(order).map((priority) => (
            <Animated.View key={priority} layout={PRIORITY_CARD_MOVE}>
              <PriorityCard
                priority={priority}
                rank={rankOf(order, priority)}
                onPress={() => place(priority)}
                compact
              />
            </Animated.View>
          ))}
        </View>

        <View className="mt-5 flex-row items-start justify-between gap-3">
          <Text className="min-w-0 flex-1 text-body text-text-secondary">
            {rankingSentence(order)}
          </Text>
          {/* Back to the usual order in one tap, for a client who has been
              trying orders out and wants the one they normally use. */}
          {!sameRanking(order, usualOrder) ? (
            <Pressable
              onPress={() => {
                setOrder([...usualOrder]);
                setMakeUsual(false);
                if (saveError) clearSaveError();
              }}
              accessibilityRole="button"
              accessibilityLabel="Use my usual order"
              className="gg-touch flex-row items-center gap-1.5 px-1"
              style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
            >
              <RotateCcw size={14} color={colors.textSecondary} strokeWidth={2} aria-hidden />
              <Text className="text-caption text-text-secondary">Use my usual order</Text>
            </Pressable>
          ) : null}
        </View>

        {/*
          Only offered once the order on screen is a real, different order: a
          box that saves nothing new would be a control that does nothing.
        */}
        {differsFromUsual ? (
          <Pressable
            onPress={() => setMakeUsual((now) => !now)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: makeUsual }}
            accessibilityLabel="Also make this my usual order"
            className="gg-touch mt-5 flex-row items-start gap-3 py-1"
            style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
          >
            <View
              className={
                makeUsual
                  ? "mt-0.5 h-6 w-6 items-center justify-center rounded-sm bg-accent"
                  : "mt-0.5 h-6 w-6 items-center justify-center rounded-sm border border-outline bg-surface"
              }
              aria-hidden
            >
              {makeUsual ? (
                <Check size={16} color={colors.accentOn} strokeWidth={2.5} aria-hidden />
              ) : null}
            </View>
            <View className="min-w-0 flex-1 gap-1">
              <Text className="text-body font-medium text-text-primary">
                Also make this my usual order
              </Text>
              <Text className="text-caption text-text-muted">
                Every job after this one starts from it too.
              </Text>
            </View>
          </Pressable>
        ) : null}

        {saveError && !saving ? (
          <View
            className="mt-5 flex-row items-start gap-3"
            accessible
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
            accessibilityLabel={`Not saved. ${saveError}`}
          >
            <CircleAlert size={20} color={colors.error} strokeWidth={2} aria-hidden />
            <View className="min-w-0 flex-1 gap-1">
              <Text className="text-body font-bold text-error">Not saved</Text>
              <Text className="text-body text-text-secondary">{saveError}</Text>
            </View>
          </View>
        ) : null}
      </ScrollView>

      <View className="gg-page flex-row gap-3 pb-2 pt-2">
        <View className="flex-1">
          {changing ? (
            <SecondaryButton label="Cancel" onPress={() => router.back()} disabled={saving} />
          ) : (
            <SecondaryButton label="Skip" onPress={skip} disabled={saving} />
          )}
        </View>
        <View className="flex-1">
          <PrimaryButton
            label={primaryLabel}
            onPress={() => void confirm()}
            disabled={!complete || saving}
          />
        </View>
      </View>
    </Screen>
  );
}
