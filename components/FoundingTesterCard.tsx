import { router } from "expo-router";
import { Award, Check, ChevronRight, Clock, Ticket, UserPlus } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";

import { useThemeColors } from "@/hooks/useTheme";
import {
  completeLine,
  INVITE_ROUTE,
  INVITE_TITLE,
  pathAccessibilityLabel,
  progressLine,
  rewardLine,
  stepAccessibilityLabel,
  stepAction,
  type MissionsView,
  type StepContext,
  type StepRow,
} from "@/lib/foundingTester";

/**
 * The five Founding Tester steps as one path, on Home and on Account.
 *
 * Read top to bottom as the order a first job goes through anyway: each step
 * a node on one line, ticked once GRIDGO counts it, the line between two done
 * steps filled. The next step is the only one that is a button — it opens
 * what does the step (a print to start, checkout, the order's tracking, its
 * survey) — and the steps after it stay quiet until they are next.
 *
 * Nothing here is yellow: the yellow "+" below it is still how a first order
 * starts, and the next step is a plain ink row under it.
 */
export function FoundingTesterCard({ view, context }: { view: MissionsView; context: StepContext }) {
  const colors = useThemeColors();
  const total = view.steps.length;

  return (
    <View testID="founding-tester-card" className="gg-card gap-4">
      <View accessible accessibilityLabel={pathAccessibilityLabel(view)} className="gap-4">
        <View className="flex-row items-center gap-3">
          <View
            aria-hidden
            className="h-10 w-10 shrink-0 items-center justify-center rounded-pill border border-outline bg-surface-variant"
          >
            <Award size={19} color={colors.brand} strokeWidth={2} />
          </View>
          <View className="min-w-0 flex-1">
            <Text className="text-body-lg font-bold text-text-primary">Become a Founding Tester</Text>
            <Text className="text-caption font-medium text-text-secondary">{progressLine(view)}</Text>
          </View>
        </View>

        {/*
          One segment per step, so the bar counts the same thing the path
          does. An open segment is the outline token: surfaceVariant all but
          disappears against the card in Dark.
        */}
        <View aria-hidden className="flex-row gap-1.5">
          {view.steps.map((step) => (
            <View
              key={step.key}
              className={step.status === "done" ? "h-1.5 flex-1 rounded-pill bg-success" : "h-1.5 flex-1 rounded-pill bg-outline"}
            />
          ))}
        </View>
      </View>

      <View>
        {view.steps.map((step, index) => (
          <PathStep
            key={step.key}
            step={step}
            index={index}
            total={total}
            // The line below a node is filled once the step after it is done too.
            lineDone={step.status === "done" && view.steps[index + 1]?.status === "done"}
            context={context}
          />
        ))}
      </View>

      <View className="gap-3 border-t border-outline-subtle pt-3">
        <View className="flex-row items-start gap-2">
          {view.complete ? (
            <Clock size={16} color={colors.textMuted} strokeWidth={2} style={{ marginTop: 2 }} />
          ) : (
            <Ticket size={16} color={colors.textMuted} strokeWidth={2} style={{ marginTop: 2 }} />
          )}
          <Text className="min-w-0 flex-1 text-caption text-text-secondary">
            {view.complete ? completeLine(view) : rewardLine(view)}
          </Text>
        </View>
        <InviteLink />
      </View>
    </View>
  );
}

const NODE = 32;

function PathStep({
  step,
  index,
  total,
  lineDone,
  context,
}: {
  step: StepRow;
  index: number;
  total: number;
  lineDone: boolean;
  context: StepContext;
}) {
  const colors = useThemeColors();
  const last = index === total - 1;
  const label = stepAccessibilityLabel(step, index, total);

  const node =
    step.status === "done" ? (
      <View className="h-8 w-8 items-center justify-center rounded-pill">
        <View
          pointerEvents="none"
          className="absolute inset-0 rounded-pill"
          style={{ backgroundColor: colors.success, opacity: 0.14 }}
        />
        <Check size={16} color={colors.success} strokeWidth={2.5} />
      </View>
    ) : (
      <View
        className="h-8 w-8 items-center justify-center rounded-pill border bg-surface"
        style={{ borderColor: step.status === "next" ? colors.textPrimary : colors.outline, borderWidth: step.status === "next" ? 2 : 1 }}
      >
        <Text className={step.status === "next" ? "text-caption font-bold text-text-primary" : "text-caption text-text-muted"}>
          {index + 1}
        </Text>
      </View>
    );

  // The rail: a node, and the line down to the next one.
  const rail = (
    <View aria-hidden className="items-center" style={{ width: NODE }}>
      {node}
      {last ? null : (
        <View className="w-0.5 flex-1 rounded-pill" style={{ minHeight: 12, backgroundColor: lineDone ? colors.success : colors.outline }} />
      )}
    </View>
  );

  if (step.status === "next") {
    const action = stepAction(step.key, context);
    return (
      <Pressable
        onPress={() => router.push(action.href as never)}
        accessibilityRole="button"
        accessibilityLabel={`${action.label}. ${label}`}
        accessibilityHint={step.detail}
        testID={`founding-tester-step-${step.key}`}
        className="flex-row gap-3"
        style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
      >
        {rail}
        <View className={last ? "min-w-0 flex-1 gap-2" : "min-w-0 flex-1 gap-2 pb-4"}>
          <View className="min-h-8 justify-center">
            <Text className="text-body font-bold text-text-primary">{step.title}</Text>
            <Text className="text-caption text-text-muted">{step.detail}</Text>
          </View>
          <View className="gg-touch flex-row items-center gap-2 self-start rounded-pill border border-text-primary px-4">
            <Text className="text-button font-bold text-text-primary">{action.label}</Text>
            <ChevronRight size={16} color={colors.textPrimary} strokeWidth={2.25} />
          </View>
        </View>
      </Pressable>
    );
  }

  return (
    <View accessible accessibilityLabel={label} testID={`founding-tester-step-${step.key}`} className="flex-row gap-3">
      {rail}
      <View className={last ? "min-h-8 min-w-0 flex-1 justify-center" : "min-h-8 min-w-0 flex-1 justify-center pb-4"}>
        <Text
          className={step.status === "done" ? "text-body font-medium text-text-primary" : "text-body font-medium text-text-secondary"}
        >
          {step.title}
        </Text>
        {step.status === "done" ? <Text className="text-caption text-success">Done</Text> : null}
      </View>
    </View>
  );
}

/** The way to "Invite a friend", under the path. */
function InviteLink() {
  const colors = useThemeColors();

  return (
    <Pressable
      onPress={() => router.push(INVITE_ROUTE)}
      accessibilityRole="button"
      accessibilityLabel={INVITE_TITLE}
      accessibilityHint="You both get a voucher when your friend finishes all five steps"
      className="gg-touch flex-row items-center gap-2"
      style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
    >
      <UserPlus size={16} color={colors.textPrimary} strokeWidth={2} aria-hidden />
      <Text className="min-w-0 flex-1 text-body font-medium text-text-primary">{INVITE_TITLE}</Text>
      <ChevronRight size={18} color={colors.textMuted} aria-hidden />
    </Pressable>
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
