import { router, useFocusEffect } from "expo-router";
import { X } from "lucide-react-native";
import { useCallback, useState } from "react";
import { ScrollView, Text, View } from "react-native";

import { ConfirmDialog } from "@/components/ConfirmDialog";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { NotFresh, PartnerGate, ProblemLine } from "@/components/organization/MemberParts";
import { Pressable } from "@/components/Pressable";
import { Screen } from "@/components/Screen";
import { SecondaryButton } from "@/components/SecondaryButton";
import { SkeletonList } from "@/components/Skeleton";
import { useLiveRefresh } from "@/hooks/useLiveRefresh";
import { useThemeColors } from "@/hooks/useTheme";
import { lastDay, memberSinceLabel } from "@/lib/memberships";
import { countOf, MEMBER_LIST_ROUTE } from "@/lib/organizationMembers";
import type { MemberListEntry } from "@/lib/organizationMembersApi";
import { useMemberInvite } from "@/store/memberInvite";

/** Invite → Waiting to confirm: the listed people who have not answered yet. */
export default function WaitingScreen() {
  const entries = useMemberInvite((s) => s.entries);
  const counts = useMemberInvite((s) => s.entryCounts);
  const next = useMemberInvite((s) => s.entriesNext);
  const status = useMemberInvite((s) => s.entriesStatus);
  const error = useMemberInvite((s) => s.entriesError);
  const loadingMore = useMemberInvite((s) => s.loadingMore);
  const removing = useMemberInvite((s) => s.removing);
  const removeError = useMemberInvite((s) => s.removeError);
  const [asking, setAsking] = useState<MemberListEntry | null>(null);

  const load = useCallback(() => useMemberInvite.getState().loadEntries(), []);
  useLiveRefresh(["identity"], load, { refreshOnFocus: false });
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  return (
    <Screen edges={["bottom"]}>
      <ScrollView className="gg-screen">
        <PartnerGate>
          <View className="gg-page gap-4 pb-16 pt-4">
            {counts && (entries.length || counts.accepted) ? (
              <View className="gap-1">
                <Text className="text-h2 text-text-primary" accessibilityRole="header">
                  {countOf(counts.waiting, "person", "people")} waiting
                </Text>
                <Text className="text-body text-text-secondary">
                  {counts.accepted
                    ? `${countOf(counts.accepted, "person", "people")} from your list confirmed. `
                    : ""}
                  Each contact is deleted when they answer, or after 30 days.
                </Text>
              </View>
            ) : null}
            {removeError ? <ProblemLine message={removeError} /> : null}
            {error && entries.length ? <NotFresh message={error} onRetry={() => void load()} /> : null}

            {entries.length ? (
              <>
                <View className="gg-card-flush">
                  {entries.map((entry, index) => (
                    <EntryLine
                      key={entry.id}
                      entry={entry}
                      divided={index > 0}
                      busy={removing !== null}
                      onRemove={() => setAsking(entry)}
                    />
                  ))}
                </View>
                {next ? (
                  <SecondaryButton
                    label={loadingMore ? "Loading…" : "Show more"}
                    disabled={loadingMore}
                    onPress={() => void useMemberInvite.getState().moreEntries()}
                  />
                ) : null}
              </>
            ) : status === "failed" ? (
              <ErrorState label="List not loaded" body={error ?? "GRIDGO could not read your member list."} onRetry={() => void load()} />
            ) : status === "ready" ? (
              <EmptyState
                title="Nobody is waiting"
                body={
                  counts?.accepted
                    ? "Everyone who answered is in Members. Upload a list any time to invite more."
                    : "Upload your member list and people who have not confirmed yet show here."
                }
                actionLabel="Upload member list"
                onAction={() => router.push(MEMBER_LIST_ROUTE)}
              />
            ) : (
              <SkeletonList count={3} />
            )}
          </View>
        </PartnerGate>
      </ScrollView>

      <ConfirmDialog
        visible={Boolean(asking)}
        question={`Take ${asking?.name ?? "this person"} off the list?`}
        body="Their contact is deleted from GRIDGO and they can no longer confirm from your list. They can still ask to join with your link."
        confirmLabel="Take off the list"
        cancelLabel="Keep on the list"
        tone="destructive"
        onConfirm={() => {
          if (asking) void useMemberInvite.getState().removeEntry(asking);
          setAsking(null);
        }}
        onCancel={() => setAsking(null)}
      />
    </Screen>
  );
}

function EntryLine({ entry, divided, busy, onRemove }: { entry: MemberListEntry; divided: boolean; busy: boolean; onRemove: () => void }) {
  const colors = useThemeColors();
  const since = memberSinceLabel(entry.memberSince);
  const until = lastDay(entry.expiresAt);
  return (
    <View className={divided ? "flex-row items-center border-t border-outline-subtle py-1 pl-4 pr-1" : "flex-row items-center py-1 pl-4 pr-1"}>
      <View className="min-w-0 flex-1 gap-0.5 py-2">
        <Text className="text-body font-medium text-text-primary" numberOfLines={1}>
          {entry.name}
        </Text>
        <Text className="text-caption text-text-secondary" numberOfLines={1}>
          {entry.contact}
        </Text>
        <Text className="text-caption text-text-muted">
          {[since ? `Since ${since}` : null, until ? `kept until ${until}` : null].filter(Boolean).join(" · ")}
        </Text>
      </View>
      <Pressable
        onPress={onRemove}
        disabled={busy}
        accessibilityRole="button"
        accessibilityLabel={`Take ${entry.name} off the list`}
        className={busy ? "gg-touch gg-disabled items-center justify-center" : "gg-touch items-center justify-center"}
        style={({ pressed }) => (pressed ? { opacity: 0.6 } : undefined)}
      >
        <X size={18} color={colors.textSecondary} strokeWidth={2} aria-hidden />
      </Pressable>
    </View>
  );
}
