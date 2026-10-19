import { Award, Check, Ticket } from "lucide-react-native";
import { Text, View } from "react-native";

import { useThemeColors } from "@/hooks/useTheme";
import {
  MISSIONS_REWARD_LINE,
  missionsAccessibilityLabel,
  progressLine,
  type FoundingTesterView,
  type MissionRow,
} from "@/lib/foundingTester";

type Missions = Extract<FoundingTesterView, { kind: "missions" }>;

/**
 * The three Founding Tester missions, on Home and on Account.
 *
 * Read as a checklist, not a progress meter with prose around it: the three
 * steps a first order goes through anyway, in that order, each ticked once
 * GRIDGO counts it, and the count said in words beside the title. The next
 * step is the one set in full ink, so the eye lands on what is left to do.
 *
 * Not a button. Every mission is something the client does elsewhere — a
 * checkout, a handover, a survey — and a card that led somewhere would lead
 * to the wrong one of those half the time. Nothing here is yellow: the yellow
 * "+" below it is still how a first order starts.
 */
export function FoundingTesterCard({ view }: { view: Missions }) {
  const colors = useThemeColors();
  const nextKey = view.missions.find((mission) => !mission.done)?.key ?? null;

  return (
    <View
      accessible
      accessibilityLabel={missionsAccessibilityLabel(view)}
      testID="founding-tester-card"
      className="gg-card gap-4"
    >
      <View className="flex-row items-center gap-3">
        <View aria-hidden className="h-10 w-10 shrink-0 items-center justify-center rounded-pill border border-outline bg-surface-variant">
          <Award size={19} color={colors.brand} strokeWidth={2} />
        </View>
        <View className="min-w-0 flex-1">
          <Text className="text-body-lg font-bold text-text-primary">Become a Founding Tester</Text>
          <Text className="text-caption font-medium text-text-secondary">{progressLine(view.doneCount)}</Text>
        </View>
      </View>

      {/*
        One segment per mission, so the bar counts the same thing the list
        does. An open segment is the outline token: surfaceVariant all but
        disappears against the card in Dark.
      */}
      <View aria-hidden className="flex-row gap-1.5">
        {view.missions.map((mission) => (
          <View
            key={mission.key}
            className={mission.done ? "h-1.5 flex-1 rounded-pill bg-success" : "h-1.5 flex-1 rounded-pill bg-outline"}
          />
        ))}
      </View>

      <View className="gap-3">
        {view.missions.map((mission, index) => (
          <MissionLine key={mission.key} mission={mission} number={index + 1} next={mission.key === nextKey} />
        ))}
      </View>

      <View className="flex-row items-start gap-2 border-t border-outline-subtle pt-3">
        <Ticket size={16} color={colors.textMuted} strokeWidth={2} style={{ marginTop: 2 }} />
        <Text className="min-w-0 flex-1 text-caption text-text-secondary">{MISSIONS_REWARD_LINE}</Text>
      </View>
    </View>
  );
}

function MissionLine({ mission, number, next }: { mission: MissionRow; number: number; next: boolean }) {
  const colors = useThemeColors();

  return (
    <View className="flex-row items-center gap-3">
      {mission.done ? (
        <View className="h-8 w-8 shrink-0 items-center justify-center rounded-pill">
          <View
            pointerEvents="none"
            className="absolute inset-0 rounded-pill"
            style={{ backgroundColor: colors.success, opacity: 0.14 }}
          />
          <Check size={16} color={colors.success} strokeWidth={2.5} />
        </View>
      ) : (
        <View
          className="h-8 w-8 shrink-0 items-center justify-center rounded-pill border"
          style={{ borderColor: next ? colors.textPrimary : colors.outline }}
        >
          <Text className={next ? "text-caption font-bold text-text-primary" : "text-caption text-text-muted"}>
            {number}
          </Text>
        </View>
      )}
      <View className="min-w-0 flex-1">
        <Text
          className={
            mission.done || next ? "text-body font-medium text-text-primary" : "text-body font-medium text-text-secondary"
          }
        >
          {mission.title}
        </Text>
        {mission.done ? (
          <Text className="text-caption text-success">Done</Text>
        ) : (
          <Text className="text-caption text-text-muted">{mission.detail}</Text>
        )}
      </View>
    </View>
  );
}

/**
 * The earned label, as a chip beside the account's kind on Account. Brand ink
 * on a hairline pill — a badge, which is what that token is for — and the word
 * always beside the mark.
 */
export function FoundingTesterChip({ label }: { label: string }) {
  const colors = useThemeColors();

  return (
    <View className="gg-chip" style={{ borderColor: colors.brand }} testID="founding-tester-chip">
      <Award size={14} color={colors.brand} strokeWidth={2} aria-hidden />
      <Text className="text-caption font-medium text-text-primary">{label}</Text>
    </View>
  );
}
