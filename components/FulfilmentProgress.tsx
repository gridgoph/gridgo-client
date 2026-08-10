import { Text, View } from "react-native";

import { StatusChip } from "@/components/StatusChip";
import type { PayoutMilestone } from "@/lib/api";
import { fulfilmentSteps, fulfilmentSummary } from "@/lib/fulfilment";

type Props = {
  milestones: PayoutMilestone[] | undefined;
};

/**
 * How far the supplier has got, and how GRIDGO knows.
 *
 * This is what the client got in place of approving a print proof. Each step
 * only moves when the supplier or rider files evidence with Operations, so the
 * list is a record of things that happened rather than a progress animation.
 *
 * Numbered, because making a job genuinely is sequential — printing, then
 * packing, then delivery — and the order is the information.
 */
export function FulfilmentProgress({ milestones }: Props) {
  const steps = fulfilmentSteps(milestones);
  if (!steps.length) return null;

  return (
    <View className="gap-4">
      <Text className="text-overline text-text-muted">PROGRESS</Text>
      <View className="gg-card gap-4">
        <Text className="text-body text-text-secondary">{fulfilmentSummary(steps)}</Text>

        {steps.map((step, index) => (
          <View key={step.code} className="flex-row gap-3">
            <Text className="w-5 text-body font-medium text-text-muted">{index + 1}</Text>
            <View className="flex-1 gap-2">
              <Text className="text-body-lg font-medium text-text-primary">{step.label}</Text>
              <Text className="text-caption text-text-muted">{step.detail}</Text>
              <View className="flex-row">
                <StatusChip tone={step.tone} label={step.statusLabel} icon={step.icon} />
              </View>
            </View>
          </View>
        ))}

        <Text className="text-caption text-text-muted">
          A step only moves once your supplier or rider files proof of it with Operations.
        </Text>
      </View>
    </View>
  );
}
