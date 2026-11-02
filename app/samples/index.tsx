import { ChevronRight } from "lucide-react-native";
import { useCallback } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useFocusEffect, useRouter, type Href } from "expo-router";

import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { Screen } from "@/components/Screen";
import { SkeletonBlock } from "@/components/Skeleton";
import { StatusChip } from "@/components/StatusChip";
import { useLiveRefresh } from "@/hooks/useLiveRefresh";
import { useThemeColors } from "@/hooks/useTheme";
import type { SampleBatch } from "@/lib/api";
import { holdLine, sampleBatchHref, sampleBatchSummary, sampleStatusView } from "@/lib/sampleFirst";
import { useSampleBatches } from "@/store/sampleBatches";

/**
 * My samples: every sample a client paid for and the batch it stands for,
 * newest first (gridgo-api#222).
 *
 * Each row says where the sample stands and how long its batch price is
 * held, and opens the sample's own screen to decide or order the batch.
 */
export default function SamplesScreen() {
  const router = useRouter();
  const list = useSampleBatches((state) => state.list);
  const listError = useSampleBatches((state) => state.listError);

  const load = useCallback(() => useSampleBatches.getState().loadList(), []);
  useLiveRefresh(["orders"], load, { refreshOnFocus: false });
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  return (
    <Screen edges={["bottom"]}>
      <ScrollView className="gg-screen" contentContainerClassName="gg-page gap-6 pb-10 pt-2">
        <View className="gap-2">
          <Text className="text-h1 text-text-primary">My samples</Text>
          <Text className="text-body-lg text-text-secondary">
            Check one piece before you print the batch. Your batch waits here at a held price until
            you decide.
          </Text>
        </View>

        {listError ? <ErrorState label="Samples not loaded" body={listError} onRetry={() => void load()} /> : null}

        {list == null && !listError ? (
          <View className="gap-3" accessibilityLabel="Loading your samples">
            <SkeletonBlock className="h-24 w-full rounded-card" />
            <SkeletonBlock className="h-24 w-full rounded-card" />
          </View>
        ) : null}

        {list && !list.length ? (
          <EmptyState
            title="No samples yet"
            body="When a shop offers one, choose Order a sample first on the product."
          />
        ) : null}

        {list?.length ? (
          <View className="gap-3">
            {list.map((batch) => (
              <SampleRow
                key={batch.id}
                batch={batch}
                onPress={() => router.push(sampleBatchHref(batch.id) as Href)}
              />
            ))}
          </View>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

function SampleRow({ batch, onPress }: { batch: SampleBatch; onPress: () => void }) {
  const colors = useThemeColors();
  const view = sampleStatusView(batch);
  const hold = holdLine(batch);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={[sampleBatchSummary(batch), view.label, hold].filter(Boolean).join(", ")}
      className="gg-card flex-row items-center gap-3"
    >
      {({ pressed }) => (
        <>
          <View className="min-w-0 flex-1 gap-1">
            <Text className="text-body-lg font-medium text-text-primary" numberOfLines={2}>
              {batch.itemName ?? "Your product"}
            </Text>
            <Text className="text-caption text-text-muted">
              Batch of {batch.batch.quantity.toLocaleString("en-PH")}
            </Text>
            <View className="mt-1 flex-row">
              <StatusChip tone={view.tone} label={view.label} icon={view.icon} />
            </View>
            {hold ? <Text className="text-caption text-text-muted">{hold}</Text> : null}
          </View>
          <ChevronRight size={18} color={colors.textMuted} strokeWidth={2} aria-hidden />
          {pressed ? <View pointerEvents="none" className="gg-pressed absolute inset-0 rounded-card" /> : null}
        </>
      )}
    </Pressable>
  );
}
