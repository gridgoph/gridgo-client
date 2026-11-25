import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { ScrollView, Text, View } from "react-native";

import { ConfirmDialog } from "@/components/ConfirmDialog";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { CheckboxRow } from "@/components/form/CheckboxRow";
import { DoneLine, NotFresh, PartnerGate, ProblemLine, TextButton } from "@/components/organization/MemberParts";
import { PrimaryButton } from "@/components/PrimaryButton";
import { Screen } from "@/components/Screen";
import { SecondaryButton } from "@/components/SecondaryButton";
import { SkeletonList } from "@/components/Skeleton";
import { countOf, memberSinceLine, RENEW_LIMIT, termsLine } from "@/lib/organizationMembers";
import { useOrganizationMembers } from "@/store/organizationMembers";

/**
 * Start of the school year: the members whose term ended, and the ones who are
 * still members. Nobody is ticked for the officer. Renewing says somebody is a
 * member this year, and that is theirs to say.
 */
export default function RenewMembersScreen() {
  const expired = useOrganizationMembers((s) => s.expired);
  const selected = useOrganizationMembers((s) => s.selected);
  const acting = useOrganizationMembers((s) => s.acting);
  const actionError = useOrganizationMembers((s) => s.actionError);
  const notice = useOrganizationMembers((s) => s.notice);
  const term = useOrganizationMembers((s) => s.summary?.term ?? null);
  const [asking, setAsking] = useState(false);

  useFocusEffect(
    useCallback(() => {
      const store = useOrganizationMembers.getState();
      store.clearAction();
      void store.loadExpired();
      void store.loadSummary();
      return () => {
        useOrganizationMembers.getState().clearAction();
        useOrganizationMembers.getState().clearSelected();
      };
    }, []),
  );

  const busy = acting !== null;
  const most = Math.min(expired.rows.length, RENEW_LIMIT);
  const allPicked = most > 0 && selected.length >= most;
  const store = useOrganizationMembers.getState();
  const termName = term?.label ?? "this term";

  return (
    <Screen edges={["bottom"]}>
      <ScrollView className="gg-screen">
        <PartnerGate>
          <View className="gg-page gap-4 pb-8 pt-4">
            {expired.rows.length ? (
              <>
                <View className="gap-1">
                  <Text className="text-h2 text-text-primary" accessibilityRole="header">
                    Who is still a member?
                  </Text>
                  <Text className="text-body text-text-secondary">
                    Tick the members to renew for {termName}. They keep their member since date. The rest stay as they are.
                  </Text>
                </View>
                {notice ? <DoneLine message={notice} /> : null}
                {expired.error ? <NotFresh message={expired.error} onRetry={() => void store.loadExpired()} /> : null}
                <View className="flex-row items-center justify-between gap-3">
                  <Text className="text-body text-text-secondary" accessibilityLiveRegion="polite">
                    {selected.length.toLocaleString("en-PH")} of {expired.total.toLocaleString("en-PH")} ticked
                  </Text>
                  <TextButton
                    label={allPicked ? "Clear all" : "Tick all"}
                    disabled={busy}
                    onPress={allPicked ? store.clearSelected : store.selectAll}
                  />
                </View>
                <View className="gg-card-flush">
                  {expired.rows.map((member, index) => (
                    <View key={member.id} className={index ? "border-t border-outline-subtle px-4 py-1" : "px-4 py-1"}>
                      <CheckboxRow
                        checked={selected.includes(member.id)}
                        onChange={() => store.toggleSelected(member.id)}
                        disabled={busy}
                        label={member.name}
                        hint={`${memberSinceLine(member.memberSince)} · ${termsLine(member.termsCount)} · last ${member.term.label}`}
                      />
                    </View>
                  ))}
                </View>
                {expired.nextCursor ? (
                  <SecondaryButton
                    label={expired.loadingMore ? "Loading…" : "Show more members"}
                    disabled={expired.loadingMore || busy}
                    onPress={() => void store.moreExpired()}
                  />
                ) : null}
              </>
            ) : expired.status === "failed" ? (
              <ErrorState
                label="Members not loaded"
                body={expired.error ?? "GRIDGO could not read your members."}
                onRetry={() => void store.loadExpired()}
              />
            ) : expired.status === "ready" ? (
              <EmptyState
                title="Nobody to renew"
                body="Members from an earlier term show here at the start of each school year."
                actionLabel="Back to Members"
                onAction={() => router.back()}
              />
            ) : (
              <SkeletonList count={4} />
            )}
          </View>
        </PartnerGate>
      </ScrollView>

      {expired.rows.length ? (
        <View className="gap-2 border-t border-outline bg-surface px-4 pb-4 pt-3">
          {actionError ? <ProblemLine message={actionError} /> : null}
          {selected.length >= RENEW_LIMIT ? (
            <Text className="text-caption text-text-muted">Renew up to {RENEW_LIMIT} at a time, then do the rest.</Text>
          ) : null}
          <PrimaryButton
            label={busy ? "Renewing…" : selected.length ? `Renew ${countOf(selected.length, "member", "members")}` : "Renew members"}
            disabled={busy || !selected.length}
            onPress={() => setAsking(true)}
          />
        </View>
      ) : null}

      <ConfirmDialog
        visible={asking}
        question={`Renew ${countOf(selected.length, "member", "members")} for ${termName}?`}
        body="Their member label and perk start again right away, and they are told."
        confirmLabel="Renew"
        cancelLabel="Not yet"
        onConfirm={() => {
          setAsking(false);
          void store.renewSelected().then((renewed) => {
            if (renewed && !useOrganizationMembers.getState().expired.rows.length) router.back();
          });
        }}
        onCancel={() => setAsking(false)}
      />
    </Screen>
  );
}
