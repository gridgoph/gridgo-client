import { ChevronLeft } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";

import { useThemeColors } from "@/hooks/useTheme";
import {
  orderStepAccessibilityLabel,
  orderStepCaption,
  orderSteps,
  type OrderStep,
  type OrderStepId,
} from "@/lib/orderSteps";

type Props = {
  /** Where the client is standing. */
  current: OrderStepId;
  /**
   * Where a finished step goes back to. Return null for a step this screen
   * cannot address — the trail draws it as done but leaves it unpressable
   * rather than sending the client somewhere approximate.
   */
  onStep: (id: OrderStepId) => void;
  /** Steps this screen can actually navigate to. */
  canGo?: (id: OrderStepId) => boolean;
};

/**
 * Where you are in one basket run: Match → Print details → Artwork → Review & pay.
 *
 * Four plates on a press, not four pages of a wizard — each is a screen the
 * client has already been through and can walk back to, and the bar's job is
 * to say which one they are standing on. A step still ahead is drawn quiet and
 * takes no tap: there is nothing on it yet, and a control that answers nothing
 * is worse than no control. A finished step the client can walk back to wears a
 * back chevron, so which labels answer a tap is seen rather than discovered, and
 * the line under the bar says what the current step asks of them.
 *
 * The current step is the one yellow thing on the bar. That is the stepper
 * exemption in the yellow rule and the whole of this component's budget, so the
 * screens it sits above keep their own single primary action.
 *
 * No crop marks. They are this app's one visual risk and they belong to
 * content — a shop's sample, trimmed — so spending them on chrome is what would
 * turn the motif into decoration.
 */
export function StepTrail({ current, onStep, canGo }: Props) {
  const steps = orderSteps(current);
  const caption = orderStepCaption(current);

  return (
    <View className="gap-1">
      <View
        className="flex-row gap-2"
        accessibilityRole="progressbar"
        accessibilityLabel={`Your order: step ${steps.findIndex((s) => s.state === "current") + 1} of ${steps.length}`}
      >
        {steps.map((step, index) => (
          <TrailStep
            key={step.id}
            step={step}
            position={index + 1}
            // Only a finished step is a destination, and only where the screen
            // has one to offer.
            onPress={
              step.state === "done" && (canGo?.(step.id) ?? true)
                ? () => onStep(step.id)
                : null
            }
          />
        ))}
      </View>
      {caption ? (
        <Text className="text-caption text-text-secondary" numberOfLines={2}>
          {caption}
        </Text>
      ) : null}
    </View>
  );
}

function TrailStep({
  step,
  position,
  onPress,
}: {
  step: OrderStep;
  position: number;
  onPress: (() => void) | null;
}) {
  const colors = useThemeColors();
  const rule =
    step.state === "current"
      ? "h-1 w-full rounded-pill bg-action-yellow"
      : step.state === "done"
        ? "h-1 w-full rounded-pill bg-accent"
        : "h-1 w-full rounded-pill bg-outline";

  const label =
    step.state === "current"
      ? "text-caption font-medium text-text-primary"
      : step.state === "done"
        ? "text-caption text-text-secondary"
        : "text-caption text-text-muted";

  const body = (
    <>
      <View className={rule} />
      <View className="min-w-0 flex-row items-center gap-0.5">
        {onPress ? (
          <ChevronLeft size={14} color={colors.textSecondary} strokeWidth={2} aria-hidden />
        ) : null}
        <Text className={`min-w-0 flex-shrink ${label}`} numberOfLines={1}>
          {step.label}
        </Text>
      </View>
    </>
  );

  if (!onPress) {
    return (
      <View
        className="min-w-0 flex-1 justify-start gap-2 py-2"
        // `accessible` groups the rule and its label into one announcement.
        // Without it the rule is a second, silent stop on the way past.
        accessible
        accessibilityRole="text"
        accessibilityState={{ selected: step.state === "current" }}
        accessibilityLabel={orderStepAccessibilityLabel(step, position, false)}
      >
        {body}
      </View>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={orderStepAccessibilityLabel(step, position)}
      className="gg-touch min-w-0 flex-1 justify-start gap-2 py-2"
      style={({ pressed }) => (pressed ? { opacity: 0.6 } : undefined)}
    >
      {body}
    </Pressable>
  );
}

/**
 * The band the trail sits in on a pushed screen.
 *
 * Its own surface with a hairline under it, directly below the navigation
 * header, so the trail reads as part of the chrome and never scrolls away from
 * the client who is using it to get back.
 */
export function StepTrailBar(props: Props) {
  return (
    <View className="border-b border-outline bg-surface px-4 pb-1 pt-1">
      <StepTrail {...props} />
    </View>
  );
}
