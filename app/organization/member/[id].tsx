import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";
import { ScrollView, Text, View } from "react-native";

import { ClientMonogram } from "@/components/ClientMonogram";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { DangerButton } from "@/components/DangerButton";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { FormField } from "@/components/form/FormField";
import {
  DoneLine,
  MemberLabel,
  MemberSinceField,
  NotFresh,
  PartnerGate,
  ProblemLine,
  StatTile,
} from "@/components/organization/MemberParts";
import { PrimaryButton } from "@/components/PrimaryButton";
import { Screen } from "@/components/Screen";
import { SecondaryButton } from "@/components/SecondaryButton";
import { SkeletonBlock } from "@/components/Skeleton";
import { StatusChip } from "@/components/StatusChip";
import {
  MEMBERS_ROUTE,
  monthYear,
  perksUsedLine,
  pickFrom,
  pickValue,
  termsLine,
  type MonthPick,
} from "@/lib/organizationMembers";
import type { OrganizationMember } from "@/lib/organizationMembersApi";
import { manilaDay } from "@/lib/organization";
import { useOrganizationMembers } from "@/store/organizationMembers";

/**
 * One member: when they joined, how often they order, and the two things an
 * officer may change. What they ordered is never sent, so it is never here.
 */
export default function MemberScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const member = useOrganizationMembers((s) => (s.member?.id === id ? s.member : null));
  const status = useOrganizationMembers((s) => s.memberStatus);
  const error = useOrganizationMembers((s) => s.memberError);
  const label = useOrganizationMembers((s) => s.summary?.label ?? null);

  useFocusEffect(
    useCallback(() => {
      const store = useOrganizationMembers.getState();
      store.clearAction();
      void store.openMember(id);
      if (!store.summary) void store.loadSummary();
      return () => useOrganizationMembers.getState().clearAction();
    }, [id]),
  );

  return (
    <Screen edges={["bottom"]}>
      <ScrollView className="gg-screen">
        <PartnerGate>
          <View className="gg-page gap-6 pb-16 pt-4">
            {member && (member.status === "active" || member.status === "expired") ? (
              <>
                {status === "failed" && error ? (
                  <NotFresh message={error} onRetry={() => void useOrganizationMembers.getState().openMember(id)} />
                ) : null}
                <MemberDetail key={member.version} member={member} label={label ?? "your organization"} />
              </>
            ) : status === "failed" && !member && error !== GONE ? (
              <ErrorState
                label="Member not loaded"
                body={error ?? "GRIDGO could not read this member."}
                onRetry={() => void useOrganizationMembers.getState().openMember(id)}
              />
            ) : status === "ready" || status === "failed" ? (
              <EmptyState
                title="No longer a member"
                body="They left or were removed. Their past orders stay as they are."
                actionLabel="Back to Members"
                onAction={() => router.dismissTo(MEMBERS_ROUTE)}
              />
            ) : (
              <View className="gap-4" accessibilityRole="progressbar" accessibilityLabel="Loading member">
                <SkeletonBlock className="h-16 w-full rounded-card" />
                <SkeletonBlock className="h-24 w-full rounded-card" />
              </View>
            )}
          </View>
        </PartnerGate>
      </ScrollView>
    </Screen>
  );
}

const GONE = "This person is no longer on your list.";

function MemberDetail({ member, label }: { member: OrganizationMember; label: string }) {
  const acting = useOrganizationMembers((s) => s.acting);
  const actionError = useOrganizationMembers((s) => s.actionError);
  const notice = useOrganizationMembers((s) => s.notice);
  const [editing, setEditing] = useState(false);
  const [removing, setRemoving] = useState(false);
  const active = member.status === "active";
  const busy = Boolean(acting);

  return (
    <>
      <View className="flex-row items-center gap-3">
        <ClientMonogram name={member.name} size={56} />
        <View className="min-w-0 flex-1 gap-1.5">
          <Text className="text-h2 text-text-primary" accessibilityRole="header">
            {member.name}
          </Text>
          {active ? <MemberLabel label={label} /> : <StatusChip tone="warning" label="Term ended" icon="clock" />}
        </View>
      </View>

      <View className="gg-card flex-row justify-between gap-4">
        <StatTile value={monthYear(member.memberSince) ?? "Not set"} label="Member since" />
        <StatTile value={member.ordersThisTerm.toLocaleString("en-PH")} label="Orders this term" />
        <StatTile value={perksUsedLine(member)} label="Perks used" />
      </View>

      {notice ? <DoneLine message={notice} /> : null}

      <View className="gg-card gap-4">
        <View className="flex-row items-center gap-3">
          <View className="min-w-0 flex-1 gap-0.5">
            <Text className="text-body-lg font-medium text-text-primary">Membership</Text>
            <Text className="text-caption text-text-muted">
              {active
                ? `Active · ${member.term.label} · ${termsLine(member.termsCount)}`
                : `Ended ${manilaDay(member.term.endsOn) ?? member.term.endsOn} · ${termsLine(member.termsCount)}`}
            </Text>
          </View>
          {editing ? null : (
            <SecondaryButton
              label="Edit date"
              disabled={busy}
              onPress={() => {
                useOrganizationMembers.getState().clearAction();
                useOrganizationMembers.getState().clearNotice();
                setEditing(true);
              }}
            />
          )}
        </View>
        {editing ? <DateEditor member={member} label={label} onClose={() => setEditing(false)} /> : null}
      </View>

      {active ? null : (
        <View className="gap-3">
          <Text className="text-body text-text-secondary">
            Their label and perk stopped when the term ended. Renew them if they are still a member.
          </Text>
          <PrimaryButton
            label={acting?.startsWith("renew") ? "Renewing…" : "Renew membership"}
            disabled={busy}
            onPress={() => void useOrganizationMembers.getState().renewOne(member)}
          />
        </View>
      )}

      {actionError && !editing ? <ProblemLine message={actionError} /> : null}

      <View className="gap-2 pt-2">
        <DangerButton
          label={acting?.startsWith("remove") ? "Removing…" : `Remove from ${label}`}
          disabled={busy}
          onPress={() => {
            useOrganizationMembers.getState().clearAction();
            setRemoving(true);
          }}
        />
        <Text className="text-center text-caption text-text-muted">
          The label and perk stop right away. Past orders stay.
        </Text>
      </View>

      <ConfirmDialog
        visible={removing}
        question={`Remove ${member.name} from ${label}?`}
        body="Their member label and perk stop right away, and they are told. Their past orders stay as they are. To come back they have to ask to join again."
        confirmLabel="Remove member"
        cancelLabel="Keep member"
        tone="destructive"
        onConfirm={() => {
          setRemoving(false);
          void useOrganizationMembers
            .getState()
            .remove(member)
            .then((removed) => {
              if (removed) router.back();
            });
        }}
        onCancel={() => setRemoving(false)}
      />
    </>
  );
}

function DateEditor({ member, label, onClose }: { member: OrganizationMember; label: string; onClose: () => void }) {
  const acting = useOrganizationMembers((s) => s.acting);
  const actionError = useOrganizationMembers((s) => s.actionError);
  const [pick, setPick] = useState<MonthPick>(() => pickFrom(member.memberSince));
  const value = pickValue(pick);
  const changed = Boolean(value) && !member.memberSince?.startsWith(value!);
  const busy = Boolean(acting);

  return (
    <View className="gap-4 border-t border-outline-subtle pt-4">
      <FormField label={`Member of ${label} since`} helper="The real month they joined. They are told the date changed.">
        <MemberSinceField pick={pick} onChange={setPick} disabled={busy} />
      </FormField>
      {actionError ? <ProblemLine message={actionError} /> : null}
      <View className="flex-row gap-3">
        <View className="flex-1">
          <SecondaryButton label="Cancel" disabled={busy} onPress={onClose} />
        </View>
        <View className="flex-1">
          <PrimaryButton
            label={acting ? "Saving…" : "Save date"}
            disabled={busy || !changed}
            onPress={() => {
              if (value) void useOrganizationMembers.getState().editSince(member, value).then((saved) => saved && onClose());
            }}
          />
        </View>
      </View>
    </View>
  );
}
