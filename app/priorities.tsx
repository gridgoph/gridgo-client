import { RotateCcw } from "lucide-react-native";
import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Screen } from "@/components/Screen";

import { useThemeColors } from "@/hooks/useTheme";
import {
  PRIORITIES,
  isCompleteRanking,
  priorityBlurb,
  priorityLabel,
  rankOf,
  rankingSentence,
  togglePlacement,
  type Priority,
} from "@/lib/priorities";
import { userFacingError } from "@/lib/copy";
import { usePriorities } from "@/store/priorities";

/**
 * Putting quality, speed, cost and distance in order.
 *
 * Asked once, immediately after the account exists, because it is what every
 * match afterwards is decided on — and asked as an ordering rather than as
 * sliders, because nobody can honestly say "quality 0.6" and two shops would
 * tie in ways GRIDGO could not then explain.
 *
 * The interaction is tap-to-place: tapping stamps the next number on a card.
 * Numbering is legitimate here in a way it usually is not — the content really
 * is a ranked sequence, and the numeral is the answer itself, not decoration.
 * Tapping a placed card takes it and everything below it back out, because a
 * client correcting second place has not yet decided third.
 *
 * Nothing is pre-ranked. A default order would be GRIDGO deciding and calling
 * it the client's choice.
 */
export default function PrioritiesScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();
  const saved = usePriorities((state) => state.ranking);
  const saveRanking = usePriorities((state) => state.save);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Opening the screen to change a saved ranking starts from that ranking, so
  // a client who only wants to swap two of them does not retype the rest.
  const [order, setOrder] = useState<Priority[]>(() => (saved ? [...saved] : []));
  const complete = isCompleteRanking(order);
  const editing = Boolean(saved);

  const save = async () => {
    if (!isCompleteRanking(order) || saving) return;
    setSaving(true);
    setError(null);
    try {
      await saveRanking(order);
    } catch (e) {
      setError(
        userFacingError(
          e,
          "GRIDGO could not save your order. Check your connection and try again.",
        ),
      );
      return;
    } finally {
      setSaving(false);
    }
    // Any `returnTo` means the client came here from a screen they were using
    // — Settings, or the match they were reading — so saving puts them back on
    // it. Only the one-off gate on the way in has none, and that lands Home.
    if (returnTo) {
      router.back();
      return;
    }
    router.replace("/(tabs)/home");
  };

  return (
    /* Bottom only — the stack header above has already cleared the status bar. */
    <Screen edges={["bottom"]}>
      <ScrollView className="gg-screen" contentContainerClassName="gg-page pb-8 pt-2">
        <Text className="text-display text-text-primary">
          What matters most on a print job?
        </Text>
        <Text className="mt-3 text-body-lg text-text-secondary">
          Put these in order. GRIDGO puts your job on one printer using this, every
          time, and tells you which one decided it.
        </Text>

        <View className="mt-8 gap-3">
          {PRIORITIES.map((priority) => (
            <PriorityCard
              key={priority}
              priority={priority}
              rank={rankOf(order, priority)}
              // Functional update, not `togglePlacement(order, …)`: several taps
              // in quick succession all read the same render's `order`, so the
              // second would drop what the first had just placed.
              onPress={() => setOrder((current) => togglePlacement(current, priority))}
            />
          ))}
        </View>

        {/*
          The order read back in words. Someone who tapped the cards in a
          hurry checks this line, not the numerals — and it is the same sentence
          the match card will echo.
        */}
        <View className="mt-6 flex-row items-start justify-between gap-3">
          <Text className="min-w-0 flex-1 text-body text-text-secondary">
            {rankingSentence(order)}
          </Text>
          {order.length ? (
            <Pressable
              onPress={() => setOrder([])}
              accessibilityRole="button"
              accessibilityLabel="Start the ranking over"
              className="gg-touch flex-row items-center gap-1.5 px-1"
              style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
            >
              <RotateCcw
                size={14}
                color={colors.textSecondary}
                strokeWidth={2}
                accessibilityElementsHidden
                importantForAccessibility="no"
              />
              <Text className="text-caption text-text-secondary">Start over</Text>
            </Pressable>
          ) : null}
        </View>

        {error ? (
          <Text className="mt-6 text-body text-error">{error}</Text>
        ) : null}

        <Pressable
          onPress={() => void save()}
          disabled={!complete || saving}
          accessibilityRole="button"
          accessibilityLabel={editing ? "Save this order" : "Save and continue"}
          accessibilityState={{ disabled: !complete || saving }}
          className={
            complete && !saving
              ? "gg-btn-primary mt-8"
              : "gg-btn-primary gg-disabled mt-8"
          }
          style={({ pressed }) =>
            pressed && complete && !saving ? { opacity: 0.9 } : undefined
          }
        >
          <Text className="text-button text-action-yellow-on">
            {saving ? "Saving…" : editing ? "Save this order" : "Save and continue"}
          </Text>
        </Pressable>

        <Text className="mt-4 text-center text-caption text-text-muted">
          It follows your account, so a new phone already knows. Change it any time in
          Settings.
        </Text>
      </ScrollView>
    </Screen>
  );
}

/**
 * One priority, and what ranking it first would cost.
 *
 * The numeral is the state: a placed card carries its rank in a filled accent
 * disc, an unplaced one carries an empty ring. Monochrome, because the yellow
 * on this screen belongs to the one button at the bottom, and because a ranking
 * has to be readable with no colour at all.
 */
function PriorityCard({
  priority,
  rank,
  onPress,
}: {
  priority: Priority;
  rank: number | null;
  onPress: () => void;
}) {
  const placed = rank != null;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={priorityLabel(priority)}
      accessibilityValue={placed ? { text: `Ranked ${rank}` } : { text: "Not ranked" }}
      accessibilityHint={
        placed ? "Removes it and anything ranked after it" : "Puts it next in your order"
      }
      className={placed ? "gg-panel-high flex-row gap-4" : "gg-card flex-row gap-4"}
      style={({ pressed }) => (pressed ? { opacity: 0.92 } : undefined)}
    >
      <View
        className={
          placed
            ? "h-8 w-8 items-center justify-center rounded-pill bg-accent"
            : "h-8 w-8 items-center justify-center rounded-pill border border-outline"
        }
        accessibilityElementsHidden
        importantForAccessibility="no"
      >
        <Text
          className={
            placed ? "text-body font-bold text-accent-on" : "text-body text-text-muted"
          }
        >
          {placed ? rank : "–"}
        </Text>
      </View>

      <View className="min-w-0 flex-1 gap-1">
        <Text className="text-h3 text-text-primary">{priorityLabel(priority)}</Text>
        <Text className="text-body text-text-secondary">{priorityBlurb(priority)}</Text>
      </View>
    </Pressable>
  );
}
