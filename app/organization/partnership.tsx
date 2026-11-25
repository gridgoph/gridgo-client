import { router, useFocusEffect } from "expo-router";
import { Lock } from "lucide-react-native";
import { useCallback } from "react";
import { ScrollView, Text, View } from "react-native";

import { ErrorState } from "@/components/ErrorState";
import { EventRow, PACK_NOTE } from "@/components/organization/EventParts";
import { LinkRow, NotFresh, PartnerBadge, PartnerGate } from "@/components/organization/MemberParts";
import { Screen } from "@/components/Screen";
import { SecondaryButton } from "@/components/SecondaryButton";
import { SkeletonBlock } from "@/components/Skeleton";
import { useLiveRefresh } from "@/hooks/useLiveRefresh";
import { useThemeColors } from "@/hooks/useTheme";
import { formatPhp } from "@/lib/api";
import { manilaDay } from "@/lib/organization";
import {
  benefitLines,
  EVENT_EDIT_ROUTE,
  eventRoute,
  EVENTS_ROUTE,
  PERK_SMALL_ORDER,
  perkHeadline,
  perkTerms,
} from "@/lib/organizationMembers";
import type { Partnership } from "@/lib/organizationMembersApi";
import { useOrganizationEvents } from "@/store/organizationEvents";
import { useOrganizationMembers } from "@/store/organizationMembers";

/**
 * Account → Partnership: what members get, what came of it, and the records an
 * officer hands in for liquidation. The perk is GRIDGO's and read only, and
 * every figure on the screen is GRIDGO's own.
 */
export default function PartnershipScreen() {
  const partnership = useOrganizationMembers((s) => s.partnership);
  const status = useOrganizationMembers((s) => s.partnershipStatus);
  const error = useOrganizationMembers((s) => s.partnershipError);

  const load = useCallback(() => useOrganizationMembers.getState().loadPartnership(), []);
  useLiveRefresh(["identity"], load, { refreshOnFocus: false });
  useFocusEffect(
    useCallback(() => {
      // What was downloaded on the last visit is old news.
      useOrganizationEvents.setState({ packNotice: null });
      void load();
    }, [load]),
  );

  return (
    <Screen edges={["bottom"]}>
      <ScrollView className="gg-screen">
        <PartnerGate>
          <View className="gg-page gap-6 pb-16 pt-4">
            {partnership ? (
              <>
                {status === "failed" && error ? <NotFresh message={error} onRetry={() => void load()} /> : null}
                <Content partnership={partnership} />
              </>
            ) : status === "failed" ? (
              <ErrorState label="Partnership not loaded" body={error ?? "GRIDGO could not read your partnership."} onRetry={() => void load()} />
            ) : (
              <View className="gap-4" accessibilityRole="progressbar" accessibilityLabel="Loading partnership">
                <SkeletonBlock className="h-32 w-full rounded-card" />
                <SkeletonBlock className="h-36 w-full rounded-card" />
                <SkeletonBlock className="h-36 w-full rounded-card" />
              </View>
            )}
          </View>
        </PartnerGate>
      </ScrollView>
    </Screen>
  );
}

const EVENTS_SHOWN = 3;

function Content({ partnership }: { partnership: Partnership }) {
  const { perk, results, events } = partnership;
  const benefits = benefitLines(partnership);
  const since = manilaDay(partnership.partnerSince);
  return (
    <>
      <View className="gap-2">
        <Text className="text-h2 text-text-primary" accessibilityRole="header">
          {partnership.label}
        </Text>
        <View className="flex-row flex-wrap items-center gap-2">
          {partnership.benefits.badge ? <PartnerBadge /> : null}
          {since ? <Text className="text-caption text-text-muted">Partner since {since}</Text> : null}
        </View>
      </View>

      <PerkCard perk={perk} />

      <View className="gap-2">
        <Text className="text-overline text-text-muted">RESULTS · {results.term.label.toUpperCase()}</Text>
        <View className="gg-card-flush">
          <ResultLine label="Members" value={results.memberCount.toLocaleString("en-PH")} />
          <ResultLine divided label="Members who ordered" value={results.membersOrdered.toLocaleString("en-PH")} />
          <ResultLine divided label="Member orders" value={results.memberOrders.toLocaleString("en-PH")} />
          <ResultLine divided label="Members saved" value={formatPhp(results.membersSavedMinor)} strong />
        </View>
      </View>

      <View className="gap-2">
        <Text className="text-overline text-text-muted">LIQUIDATION RECORDS</Text>
        {events.length ? (
          <View className="gg-card-flush">
            {events.slice(0, EVENTS_SHOWN).map((event, index) => (
              <EventRow key={event.id} event={event} divided={index > 0} onOpen={() => router.push(eventRoute(event.id))} />
            ))}
            <LinkRow divided title="All events" detail="Group your organization's orders by event" onPress={() => router.push(EVENTS_ROUTE)} />
          </View>
        ) : (
          <View className="gg-card gap-3">
            <Text className="text-body-lg font-medium text-text-primary">No events yet</Text>
            <Text className="text-body text-text-secondary">
              Group your organization&apos;s orders by event, then download one statement for each.
            </Text>
            <SecondaryButton
              label="Add an event"
              onPress={() => {
                useOrganizationEvents.getState().startForm(null);
                router.push(EVENT_EDIT_ROUTE);
              }}
            />
          </View>
        )}
        <Text className="text-caption text-text-muted">{PACK_NOTE}</Text>
      </View>

      {benefits.length ? (
        <View className="gap-2">
          <Text className="text-overline text-text-muted">PARTNER BENEFITS</Text>
          <View className="gg-card gap-2">
            {benefits.map((line) => (
              <Text key={line} className="text-body text-text-primary">
                {line}
              </Text>
            ))}
          </View>
        </View>
      ) : null}

      <View className="gap-2">
        <Text className="text-overline text-text-muted">NEW OFFICERS</Text>
        <View className="gg-card-flush">
          <LinkRow
            title="Hand over to a new officer"
            detail="Members, requests and records stay with the organization"
            onPress={() => router.push("/officer-handover")}
          />
        </View>
      </View>
    </>
  );
}

function PerkCard({ perk }: { perk: Partnership["perk"] }) {
  const colors = useThemeColors();
  return (
    <View className="gg-card gap-3" testID="perk-card">
      <View className="flex-row items-center justify-between gap-3">
        <Text className="text-body text-text-secondary">Member perk</Text>
        <View className="gg-chip border-outline">
          <Lock size={13} color={colors.textSecondary} strokeWidth={2} aria-hidden />
          <Text className="text-caption text-text-secondary">Set by GRIDGO</Text>
        </View>
      </View>
      {perk ? (
        <View className="gap-1">
          <Text className="text-h2 text-text-primary">{perkHeadline(perk.amountMinor)}</Text>
          <Text className="text-body text-text-secondary">{perkTerms(perk)}</Text>
          <Text className="text-caption text-text-muted">{PERK_SMALL_ORDER}</Text>
        </View>
      ) : (
        <View className="gap-1">
          <Text className="text-h3 text-text-primary">No perk right now</Text>
          <Text className="text-body text-text-secondary">When GRIDGO sets one, your members get it at checkout by itself.</Text>
        </View>
      )}
    </View>
  );
}

function ResultLine({ label, value, divided = false, strong = false }: { label: string; value: string; divided?: boolean; strong?: boolean }) {
  return (
    <View
      className={divided ? "min-h-11 flex-row items-center gap-3 border-t border-outline-subtle px-4 py-3" : "min-h-11 flex-row items-center gap-3 px-4 py-3"}
      accessible
      accessibilityLabel={`${label}: ${value}`}
    >
      <Text className="min-w-0 flex-1 text-body text-text-secondary">{label}</Text>
      <Text className={strong ? "text-h3 text-text-primary" : "text-body-lg font-medium text-text-primary"}>{value}</Text>
    </View>
  );
}
