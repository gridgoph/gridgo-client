import { useRouter, type Href } from "expo-router";
import { ChevronRight, CircleCheck, MessageSquareText, Ticket } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";

import { PrimaryButton } from "@/components/PrimaryButton";
import { SecondaryButton } from "@/components/SecondaryButton";
import { useThemeColors } from "@/hooks/useTheme";
import { useServerNow } from "@/hooks/useVoucherClock";
import { formatPhp } from "@/lib/api";
import {
  issuedSurveyReward,
  rewardBadge,
  openUntilLine,
  surveyRoute,
  surveyView,
} from "@/lib/survey";
import { useSurvey } from "@/store/survey";

/**
 * The post-order survey on the order screen (report 81CA4493).
 *
 * Three shapes, by where the survey stands:
 *
 * - **Offered**: a short card that says how long it takes, what the voucher
 *   is for, and until when it stays open. "Skip" is right there, because the
 *   survey is optional and saying so is what makes it feel optional.
 * - **Skipped**: one quiet row, so the survey can still be answered until it
 *   closes without asking again.
 * - **Sent**: one row of thanks, and the way back to the voucher's code.
 *
 * `primary` says whether this card may spend the screen's yellow: only when
 * no action zone above it already has. An issue window's "Everything is fine"
 * or a payment is the real next step; the survey waits its turn beneath it.
 *
 * The order screen reads the survey with the order (`useSurvey.load`); this
 * card only draws it. A failed read draws nothing — an optional survey is not
 * worth an error on somebody's order.
 */
export function SurveyCard({ orderId, primary }: { orderId: string; primary: boolean }) {
  const router = useRouter();
  const colors = useThemeColors();
  const survey = useSurvey((state) => state.surveys[orderId]);
  const busy = useSurvey((state) => state.busy[orderId] ?? null);
  const error = useSurvey((state) => state.errors[orderId] ?? null);
  const dismiss = useSurvey((state) => state.dismiss);
  const now = useServerNow(60_000);
  const view = surveyView(survey, now);
  if (!view) return null;

  const open = () => router.push(surveyRoute(orderId, "order") as Href);

  if (view.kind === "invite") {
    const reward = rewardBadge(view.survey);
    return (
      <View className="gg-card gap-4" testID="survey-card">
        <View className="gap-2">
          <Text className="text-h3 text-text-primary">How did your order go?</Text>
          <Text className="text-body text-text-secondary">
            Three quick questions, and a few more if you like. About 30 seconds.
          </Text>
        </View>
        {reward ? (
          <View className="flex-row items-center gap-3 rounded-field bg-surface-variant px-3 py-2">
            <Ticket size={18} color={colors.textPrimary} strokeWidth={2} aria-hidden />
            <Text className="flex-1 text-body text-text-primary">
              {reward}
            </Text>
          </View>
        ) : null}
        <Text className="text-caption text-text-muted">{openUntilLine(view.survey)}</Text>
        {error ? <Text className="text-caption text-error" accessibilityRole="alert">{error}</Text> : null}
        <View className="gap-2">
          {primary ? (
            <PrimaryButton label="Answer the survey" onPress={open} disabled={busy != null} />
          ) : (
            <SecondaryButton label="Answer the survey" onPress={open} disabled={busy != null} />
          )}
          <Pressable
            onPress={() => void dismiss(orderId)}
            disabled={busy != null}
            accessibilityRole="button"
            accessibilityLabel="Skip the survey"
            accessibilityState={{ disabled: busy != null }}
            className="gg-touch items-center justify-center"
            style={({ pressed }) => (pressed ? { opacity: 0.6 } : busy ? { opacity: 0.38 } : undefined)}
          >
            <Text className="text-button text-text-secondary">{busy === "dismissing" ? "Skipping…" : "Skip"}</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const sent = view.kind === "sent";
  const issued = sent ? issuedSurveyReward(view.survey) : null;
  const title = sent ? "Survey sent. Thank you." : "Order survey";
  const detail = sent
    ? issued
      ? `Your ${formatPhp(issued.valueMinor)} voucher is in your wallet. Open for its code.`
      : "Your answers reached GRIDGO."
    : `Skipped. You can still answer it. ${openUntilLine(view.survey)}.`;
  return (
    <Pressable
      onPress={open}
      accessibilityRole="button"
      accessibilityLabel={`${title} ${detail}`}
      testID="survey-row"
      className="gg-card gg-touch flex-row items-center gap-3"
      style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
    >
      {sent ? (
        <CircleCheck size={20} color={colors.success} strokeWidth={2} aria-hidden />
      ) : (
        <MessageSquareText size={20} color={colors.textSecondary} strokeWidth={2} aria-hidden />
      )}
      <View className="flex-1 gap-0.5">
        <Text className="text-body font-medium text-text-primary">{title}</Text>
        <Text className="text-caption text-text-muted">{detail}</Text>
      </View>
      <ChevronRight size={18} color={colors.textMuted} strokeWidth={2} aria-hidden />
    </Pressable>
  );
}
