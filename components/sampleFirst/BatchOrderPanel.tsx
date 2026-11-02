import { Pressable, Text, View } from "react-native";

import { QuantityStepper } from "@/components/form/QuantityStepper";
import { PrimaryButton } from "@/components/PrimaryButton";
import { ChoiceList, type Choice } from "@/components/sampleFirst/ChoiceList";
import { SkeletonLine } from "@/components/Skeleton";
import { formatPhp, type SampleBatch, type SampleBatchPricing } from "@/lib/api";
import { batchOrderLabel, batchPriceAt, heldPriceNote, holdLine } from "@/lib/sampleFirst";
import { useSampleBatches } from "@/store/sampleBatches";

/**
 * Ordering the batch an approved sample stands for (gridgo-api#222).
 *
 * The quantity can change and lands in whichever held bulk price applies;
 * everything else keeps the sample's specs, because the approval is what the
 * batch is held to. Both prices are shown beside each other: the held one
 * while the hold lasts, and today's, which is what is left once it ends.
 * They are printing only, fee inside; checkout adds delivery.
 */
export function BatchOrderPanel({
  batch,
  quantity,
  onQuantity,
  pricing,
  onPricing,
  onOrder,
  onNewSample,
}: {
  batch: SampleBatch;
  quantity: number;
  onQuantity: (next: number) => void;
  pricing: SampleBatchPricing | null;
  onPricing: (next: SampleBatchPricing) => void;
  onOrder: () => void;
  onNewSample: () => void;
}) {
  const busy = useSampleBatches((state) => state.busy);
  const held = batchPriceAt(batch, "held", quantity);
  const current = batchPriceAt(batch, "current", quantity);
  const chosenPrice = pricing === "held" ? held : pricing === "current" ? current : null;
  const priced = typeof chosenPrice === "number";

  const choices: Choice<SampleBatchPricing>[] = [
    {
      value: "held",
      label: "Held price",
      note: batch.canOrderAtHeldPrice ? holdLine(batch) : heldPriceNote(batch),
      disabled: !batch.canOrderAtHeldPrice,
      trailing: <PriceFigure minor={held} />,
      trailingLabel: priceSpoken(held),
    },
    {
      value: "current",
      label: "Today's price",
      note: "What this shop charges now.",
      disabled: !batch.canOrderAtCurrentPrice,
      trailing: <PriceFigure minor={current} />,
      trailingLabel: priceSpoken(current),
    },
  ];

  return (
    <View className="gap-4">
      <Text className="text-overline text-text-muted">ORDER THE BATCH</Text>

      <View className="gap-2">
        <Text className="text-body font-medium text-text-primary">How many</Text>
        <QuantityStepper value={quantity} unit="" onChange={onQuantity} />
        <Text className="text-caption text-text-muted">
          You sampled a batch of {batch.batch.quantity.toLocaleString("en-PH")}. A bigger batch gets
          the shop&apos;s bulk price from when you ordered the sample.
        </Text>
      </View>

      <ChoiceList label="Batch price" choices={choices} selected={pricing} onSelect={onPricing} disabled={busy != null} />
      <Text className="text-caption text-text-muted">
        Printing for {quantity.toLocaleString("en-PH")}. Delivery is added at checkout.
      </Text>

      <View className="gap-2">
        <PrimaryButton
          label={busy === "order" ? "Opening your order…" : batchOrderLabel(pricing ?? "current")}
          disabled={busy != null || pricing == null || !priced}
          onPress={onOrder}
        />
        {chosenPrice === null ? (
          <Text className="text-center text-caption text-warning">
            GRIDGO cannot price this quantity. Try another amount.
          </Text>
        ) : null}
      </View>

      <View className="gap-2">
        <Text className="text-caption text-text-muted">
          Your batch keeps the specs of the sample you approved. To change anything else, order a new
          sample.
        </Text>
        <Pressable
          onPress={onNewSample}
          accessibilityRole="button"
          className="gg-touch items-center justify-center"
          style={({ pressed }) => (pressed ? { opacity: 0.6 } : undefined)}
        >
          <Text className="text-button text-text-secondary">Order a new sample</Text>
        </Pressable>
      </View>
    </View>
  );
}

/** A figure, a skeleton while that quantity is being priced, or a dash when it cannot be. */
function PriceFigure({ minor }: { minor: number | null | undefined }) {
  if (minor === undefined) return <SkeletonLine width="w-16" />;
  return <Text className="text-body font-medium text-text-primary">{minor == null ? "—" : formatPhp(minor)}</Text>;
}

function priceSpoken(minor: number | null | undefined): string | null {
  if (minor === undefined) return "being worked out";
  return minor == null ? "not available for this quantity" : formatPhp(minor);
}
