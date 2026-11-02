import { ChevronRight } from "lucide-react-native";
import { useCallback } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useFocusEffect, useRouter, type Href } from "expo-router";

import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { PrimaryButton } from "@/components/PrimaryButton";
import { Screen } from "@/components/Screen";
import { SkeletonBlock } from "@/components/Skeleton";
import { StatusChip } from "@/components/StatusChip";
import { useLiveRefresh } from "@/hooks/useLiveRefresh";
import { useThemeColors } from "@/hooks/useTheme";
import type { QuoteRequest } from "@/lib/api";
import { newQuoteHref, quoteHref, quoteProductName, quoteStatusView, validityLine } from "@/lib/quoteRequests";
import { useQuotes } from "@/store/quotes";

/**
 * My quotes: every quote request, newest first (gridgo-api#226).
 *
 * Custom signage and 3D printing have no list price, so they start here.
 * Each row says where its quote stands in plain words and opens it.
 */
export default function QuotesScreen() {
  const router = useRouter();
  const list = useQuotes((state) => state.list);
  const listError = useQuotes((state) => state.listError);

  const load = useCallback(() => useQuotes.getState().loadList(), []);
  useLiveRefresh(["notifications"], load, { refreshOnFocus: false });
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  return (
    <Screen edges={["bottom"]}>
      <ScrollView className="gg-screen" contentContainerClassName="gg-page gap-6 pb-10 pt-2">
        <View className="gap-2">
          <Text className="text-h1 text-text-primary">My quotes</Text>
          <Text className="text-body-lg text-text-secondary">
            Custom signage and 3D printing are priced by shops. Send a brief and choose from up to
            three options.
          </Text>
        </View>

        <PrimaryButton label="Request a quote" onPress={() => router.push(newQuoteHref() as Href)} />

        {listError ? <ErrorState label="Quotes not loaded" body={listError} onRetry={() => void load()} /> : null}

        {list == null && !listError ? (
          <View className="gap-3" accessibilityLabel="Loading your quotes">
            <SkeletonBlock className="h-24 w-full rounded-card" />
            <SkeletonBlock className="h-24 w-full rounded-card" />
          </View>
        ) : null}

        {list && !list.length ? (
          <EmptyState
            title="No quotes yet"
            body="When you request one, it shows here with its options."
          />
        ) : null}

        {list?.length ? (
          <View className="gap-3">
            {list.map((quote) => (
              <QuoteRow key={quote.id} quote={quote} onPress={() => router.push(quoteHref(quote.id) as Href)} />
            ))}
          </View>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

function QuoteRow({ quote, onPress }: { quote: QuoteRequest; onPress: () => void }) {
  const colors = useThemeColors();
  const view = quoteStatusView(quote);
  const validity = validityLine(quote);
  const name = quoteProductName(quote);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={[name, quote.use, view.label, validity].filter(Boolean).join(", ")}
      className="gg-card flex-row items-center gap-3"
    >
      {({ pressed }) => (
        <>
          <View className="min-w-0 flex-1 gap-1">
            <Text className="text-body-lg font-medium text-text-primary">{name}</Text>
            <Text className="text-caption text-text-muted" numberOfLines={1}>
              {quote.use} · {quote.quantity.toLocaleString("en-PH")}
            </Text>
            <View className="mt-1 flex-row">
              <StatusChip tone={view.tone} label={view.label} icon={view.icon} />
            </View>
            {validity ? <Text className="text-caption text-text-muted">{validity}</Text> : null}
          </View>
          <ChevronRight size={18} color={colors.textMuted} strokeWidth={2} aria-hidden />
          {pressed ? <View pointerEvents="none" className="gg-pressed absolute inset-0 rounded-card" /> : null}
        </>
      )}
    </Pressable>
  );
}
