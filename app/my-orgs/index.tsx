import { useFocusEffect, useRouter } from "expo-router";
import { Lock, UsersRound } from "lucide-react-native";
import { useCallback } from "react";
import { ScrollView, Text, View } from "react-native";

import { ErrorState } from "@/components/ErrorState";
import { HomeEscape } from "@/components/HomeEscape";
import { MemberMatchCard } from "@/components/MemberMatchCard";
import { MembershipCard } from "@/components/MembershipCard";
import { PrimaryButton } from "@/components/PrimaryButton";
import { Screen } from "@/components/Screen";
import { SecondaryButton } from "@/components/SecondaryButton";
import { SkeletonBlock } from "@/components/Skeleton";
import { useLiveRefresh } from "@/hooks/useLiveRefresh";
import { useThemeColors } from "@/hooks/useTheme";
import {
  currentMemberships,
  endedLine,
  endedMemberships,
  JOIN_ORG_ROUTE,
  MEMBER_PRIVACY_LINE,
  orgName,
} from "@/lib/memberships";
import { useMemberships, useOwnMatches, useOwnMemberships } from "@/store/memberships";

/**
 * Account → My orgs (gridgo-client#475): who lists you, where each membership
 * stands, what its perk has left, and the way to join another.
 */
export default function MyOrgsScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const memberships = useOwnMemberships();
  const matches = useOwnMatches();
  const error = useMemberships((state) => state.error);
  const unavailable = useMemberships((state) => state.unavailable);
  const load = useMemberships((state) => state.load);

  useFocusEffect(
    useCallback(() => {
      void load();
      return () => useMemberships.getState().clearActionError();
    }, [load]),
  );
  useLiveRefresh(["identity", "notifications"], load, { refreshOnFocus: false });

  const join = () => router.push(JOIN_ORG_ROUTE);
  const current = memberships ? currentMemberships(memberships) : [];
  const ended = memberships ? endedMemberships(memberships) : [];
  const empty = memberships !== null && !current.length && !matches.length;

  return (
    <Screen edges={["bottom"]}>
      <HomeEscape />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }}>
        {memberships === null && !error && !unavailable ? (
          <View className="gap-4" accessibilityRole="progressbar" accessibilityLabel="Loading your orgs">
            <SkeletonBlock className="h-64" />
            <SkeletonBlock className="h-28" />
          </View>
        ) : null}

        {memberships === null && unavailable ? (
          <View className="gg-panel">
            <Text className="text-body text-text-secondary">Member perks are not open yet. Check back soon.</Text>
          </View>
        ) : null}

        {error ? (
          memberships === null ? (
            <ErrorState label="Not loaded" body={error} onRetry={() => void load()} />
          ) : (
            // What is on screen is still the last answer; say it may be old.
            <Text className="text-caption text-error" accessibilityRole="alert">
              {error}
            </Text>
          )
        ) : null}

        {matches.map((match) => (
          <MemberMatchCard key={match.id} match={match} />
        ))}

        {empty ? (
          <View className="items-center gap-3 px-4 pb-2 pt-8">
            <View className="h-16 w-16 items-center justify-center rounded-pill bg-surface-variant">
              <UsersRound size={28} color={colors.textSecondary} strokeWidth={2} aria-hidden />
            </View>
            <Text className="text-center text-h3 text-text-primary" accessibilityRole="header">
              Join your org
            </Text>
            <Text className="text-center text-body text-text-secondary">
              Members of partner orgs get money off their orders. Your officer has the QR or the link.
            </Text>
          </View>
        ) : null}

        {current.map((membership) => (
          <MembershipCard key={membership.id} membership={membership} />
        ))}

        {memberships !== null && !unavailable ? (
          empty ? (
            <PrimaryButton label="Join an org" onPress={join} />
          ) : (
            <SecondaryButton label="Join another org" onPress={join} />
          )
        ) : null}

        {ended.length ? (
          <View className="gap-2">
            <Text className="text-overline text-text-muted">EARLIER</Text>
            <View className="gg-card-flush">
              {ended.map((membership, index) => (
                <View
                  key={membership.id}
                  className={index ? "gap-0.5 border-t border-outline-subtle px-4 py-3" : "gap-0.5 px-4 py-3"}
                  accessible
                >
                  <Text className="text-body font-medium text-text-primary">{orgName(membership)}</Text>
                  <Text className="text-caption text-text-secondary">{endedLine(membership)}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {memberships !== null && !unavailable ? (
          <View className="flex-row items-start gap-2 px-1">
            <Lock size={14} color={colors.textMuted} strokeWidth={2} aria-hidden />
            <Text className="min-w-0 flex-1 text-caption text-text-muted">{MEMBER_PRIVACY_LINE}</Text>
          </View>
        ) : null}
      </ScrollView>
    </Screen>
  );
}
