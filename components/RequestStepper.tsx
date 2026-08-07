import { Text, View } from "react-native";

import { REQUEST_STEPS, type RequestStepId } from "@/lib/requestValidation";

type Props = {
  /** Zero-based index of the current step. */
  currentIndex: number;
};

/**
 * Four-step print request progress.
 * The current step is the only yellow element on the bar.
 */
export function RequestStepper({ currentIndex }: Props) {
  return (
    <View className="flex-row items-center gap-2" accessibilityRole="progressbar">
      {REQUEST_STEPS.map((step, index) => {
        const current = index === currentIndex;
        const done = index < currentIndex;
        return (
          <StepPill
            key={step.id}
            label={step.label}
            stepId={step.id}
            index={index}
            current={current}
            done={done}
          />
        );
      })}
    </View>
  );
}

function StepPill({
  label,
  index,
  current,
  done,
}: {
  label: string;
  stepId: RequestStepId;
  index: number;
  current: boolean;
  done: boolean;
}) {
  const shell = current
    ? "flex-1 rounded-field bg-action-yellow px-2 py-2"
    : done
      ? "flex-1 rounded-field border border-outline bg-surface-high px-2 py-2"
      : "flex-1 rounded-field border border-outline bg-surface px-2 py-2";

  const text = current
    ? "text-center text-caption font-medium text-action-yellow-on"
    : done
      ? "text-center text-caption text-text-primary"
      : "text-center text-caption text-text-muted";

  return (
    <View
      className={shell}
      accessibilityState={{ selected: current }}
      accessibilityLabel={`Step ${index + 1}: ${label}${current ? ", current" : done ? ", done" : ""}`}
    >
      <Text className={text} numberOfLines={1}>
        {index + 1}. {label}
      </Text>
    </View>
  );
}
