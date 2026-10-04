import { Check } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { PriorityRankingBoard } from "@/components/PriorityRankingBoard";
import { Screen } from "@/components/Screen";

import { useThemeColors } from "@/hooks/useTheme";
import {
  isCompleteRanking,
  sameRanking,
  togglePlacement,
  type Priority,
} from "@/lib/priorities";
import { usePriorities } from "@/store/priorities";

/** Long enough to read "Saved" before the screen closes, short enough not to wait on. */
const SAVED_BEAT_MS = 600;

/**
 * Putting quality, speed, cost and distance in order.
 *
 * First set on the last page of onboarding (gridgo-client#159), because it is
 * what every match afterwards is decided on; this screen is where Account sends
 * a client to change it. Asked as an ordering rather than as
 * sliders, because nobody can honestly say "quality 0.6" and two shops would
 * tie in ways GRIDGO could not then explain.
 *
 * The interaction is tap-to-place: tapping stamps the next number on a card.
 * Numbering is legitimate here in a way it usually is not — the content really
 * is a ranked sequence, and the numeral is the answer itself, not decoration.
 * Tapping a placed card takes it and everything below it back out, because a
 * client correcting second place has not yet decided third.
 *
 * The cards are drawn in rank order, ranked ones first, so the numerals always
 * count down the screen — drawn in a fixed order they read 1, 2, 4, 3 and a
 * client could not tell which order they had saved (gridgo-client#127).
 *
 * Saving has three honest ends: "Saved" (with a tick, and the button stays
 * that way while the order on screen is the one GRIDGO holds), a failure that
 * says it is not saved and turns the button into "Try again", or — while the
 * request is out — "Saving…", which the request deadline in `lib/api.ts` ends.
 * The save lifecycle lives in `store/priorities.ts`.
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
  const saving = usePriorities((state) => state.saving);
  const saveError = usePriorities((state) => state.saveError);
  const clearSaveError = usePriorities((state) => state.clearSaveError);
  // Opening the screen to change a saved ranking starts from that ranking, so
  // a client who only wants to swap two of them does not retype the rest.
  const [order, setOrder] = useState<Priority[]>(() => (saved ? [...saved] : []));
  const complete = isCompleteRanking(order);
  const editing = Boolean(saved);
  /** What is on screen is what GRIDGO holds, so there is nothing to save. */
  const upToDate = editing && sameRanking(order, saved);
  const canSave = complete && !saving && !upToDate;
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Leaving drops a pending close and an old failure, so reopening the screen
  // does not greet the client with last visit's "Not saved".
  useEffect(
    () => () => {
      if (leaveTimer.current) clearTimeout(leaveTimer.current);
      usePriorities.getState().clearSaveError();
    },
    [],
  );

  const place = (priority: Priority) => {
    // Functional update, not `togglePlacement(order, …)`: several taps in quick
    // succession all read the same render's `order`, so the second would drop
    // what the first had just placed.
    setOrder((current) => togglePlacement(current, priority));
    if (saveError) clearSaveError();
  };

  const save = async () => {
    if (!isCompleteRanking(order) || saving) return;
    const kept = await saveRanking(order);
    if (!kept) return;
    // Any `returnTo` means the client came here from a screen they were using
    // — Account, or the match they were reading — so saving puts them back on
    // it. Opened with none (a stale link), saving lands Home.
    leaveTimer.current = setTimeout(() => {
      if (returnTo) {
        router.back();
        return;
      }
      router.replace("/(tabs)/home");
    }, SAVED_BEAT_MS);
  };

  const buttonLabel = saving
    ? "Saving…"
    : upToDate
      ? "Saved"
      : saveError
        ? "Try again"
        : editing
          ? "Save this order"
          : "Save and continue";

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

        <View className="mt-8">
          <PriorityRankingBoard
            order={order}
            onPlace={place}
            onReset={() => {
              setOrder([]);
              if (saveError) clearSaveError();
            }}
            saveError={saveError}
            saving={saving}
          />
        </View>

        <Pressable
          onPress={() => void save()}
          disabled={!canSave}
          accessibilityRole="button"
          accessibilityLabel={buttonLabel}
          accessibilityState={{ disabled: !canSave, busy: saving }}
          className={
            canSave ? "gg-btn-primary mt-8" : "gg-btn-primary gg-disabled mt-8"
          }
          style={({ pressed }) => (pressed && canSave ? { opacity: 0.9 } : undefined)}
        >
          <View className="flex-row items-center justify-center gap-2">
            {upToDate && !saving ? (
              <Check size={18} color={colors.actionYellowOn} strokeWidth={2.5} aria-hidden />
            ) : null}
            <Text className="text-button text-action-yellow-on">{buttonLabel}</Text>
          </View>
        </Pressable>

        <Text className="mt-4 text-center text-caption text-text-muted">
          It follows your account, so a new phone already knows. Change it any time in
          Settings.
        </Text>
      </ScrollView>
    </Screen>
  );
}
