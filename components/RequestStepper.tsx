import { Text, View } from "react-native";

import { REQUEST_STEPS } from "@/lib/requestValidation";

/** Anything with an id and a name a client would recognise the step by. */
export type StepperStep = { id: string; label: string };

type Props = {
  /** Zero-based index of the current step. */
  currentIndex: number;
  /**
   * The steps to draw. Defaults to the print request's four, which is what
   * every caller wanted until a second numbered flow — the business
   * application — needed the same bar. Same language, same yellow budget, one
   * component: two step bars that looked alike but behaved differently would
   * be worse than either.
   */
  steps?: readonly StepperStep[];
};

/**
 * Progress through a numbered flow.
 * The current step is the only yellow element on the bar.
 */
export function RequestStepper({ currentIndex, steps = REQUEST_STEPS }: Props) {
  return (
    <View className="flex-row items-center gap-2" accessibilityRole="progressbar">
      {steps.map((step, index) => {
        const current = index === currentIndex;
        const done = index < currentIndex;
        return (
          <StepPill
            key={step.id}
            label={step.label}
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
