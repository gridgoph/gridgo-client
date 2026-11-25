import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";
import { Text, View } from "react-native";

import { ClientMonogram } from "@/components/ClientMonogram";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { FormScreen } from "@/components/FormScreen";
import { FormField } from "@/components/form/FormField";
import { MemberLabel, MemberSinceField, PartnerGate, ProblemLine } from "@/components/organization/MemberParts";
import { PrimaryButton } from "@/components/PrimaryButton";
import { SecondaryButton } from "@/components/SecondaryButton";
import { SkeletonBlock } from "@/components/Skeleton";
import {
  askedLine,
  MEMBERS_ROUTE,
  pickFrom,
  pickProblem,
  pickValue,
  returningLine,
  termEndsLine,
  type MonthPick,
} from "@/lib/organizationMembers";
import type { MemberRequest } from "@/lib/organizationMembersApi";
import { useOrganizationMembers } from "@/store/organizationMembers";

/**
 * Approving one request: the real date they joined, and the term it covers.
 *
 * The date starts empty, because the day they asked is not the day they
 * joined. Only somebody who was a member before keeps the date from then.
 */
export default function ApproveMemberScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const request = useOrganizationMembers((s) => s.requests.rows.find((row) => row.id === id) ?? null);
  const status = useOrganizationMembers((s) => s.requests.status);
  const error = useOrganizationMembers((s) => s.requests.error);
  const summary = useOrganizationMembers((s) => s.summary);
  const actionError = useOrganizationMembers((s) => s.actionError);

  useFocusEffect(
    useCallback(() => {
      const store = useOrganizationMembers.getState();
      if (store.requests.status !== "ready") void store.loadRequests();
      if (!store.summary) void store.loadSummary();
    }, []),
  );

  return (
    <FormScreen>
      <PartnerGate>
        <View className="gg-page gap-6 pb-16 pt-4">
          {request ? (
            <ApproveForm key={`${request.id}:${request.version}`} request={request} label={summary?.label ?? "your organization"} />
          ) : status === "failed" ? (
            <ErrorState
              label="Request not loaded"
              body={error ?? "GRIDGO could not read this request."}
              onRetry={() => void useOrganizationMembers.getState().loadRequests()}
            />
          ) : status === "ready" ? (
            <EmptyState
              title="Already answered"
              body={actionError ?? "This request was answered or cancelled, so there is nothing left to do here."}
              actionLabel="Back to Members"
              onAction={() => router.dismissTo(MEMBERS_ROUTE)}
            />
          ) : (
            <View className="gap-4" accessibilityRole="progressbar" accessibilityLabel="Loading request">
              <SkeletonBlock className="h-16 w-full rounded-card" />
              <SkeletonBlock className="h-12 w-full rounded-field" />
              <SkeletonBlock className="h-12 w-full rounded-field" />
            </View>
          )}
        </View>
      </PartnerGate>
    </FormScreen>
  );
}

function ApproveForm({ request, label }: { request: MemberRequest; label: string }) {
  const acting = useOrganizationMembers((s) => s.acting);
  const actionError = useOrganizationMembers((s) => s.actionError);
  const [pick, setPick] = useState<MonthPick>(() => pickFrom(request.memberSince));
  const [tried, setTried] = useState(false);
  const [declining, setDeclining] = useState(false);
  const value = pickValue(pick);
  const busy = Boolean(acting);

  const approve = async () => {
    setTried(true);
    if (!value) return;
    // A returning member's own day is kept while the month is unchanged.
    const since = request.memberSince?.startsWith(value) ? request.memberSince : value;
    if (await useOrganizationMembers.getState().approve(request, since, request.term.code)) router.back();
  };

  return (
    <>
      <View className="flex-row items-center gap-3">
        <ClientMonogram name={request.name} size={56} />
        <View className="min-w-0 flex-1 gap-0.5">
          <Text className="text-h2 text-text-primary" accessibilityRole="header">
            {request.name}
          </Text>
          <Text className="text-body text-text-secondary">{askedLine(request.requestedAt, request.source)}</Text>
        </View>
      </View>

      <FormField
        label={`Member of ${label} since`}
        helper={
          request.memberSince
            ? `${returningLine(request.memberSince)}. Change it only if it is wrong.`
            : "The real month they joined, not today. Long-time members keep their history."
        }
        error={tried ? pickProblem(pick) : null}
      >
        <MemberSinceField pick={pick} onChange={setPick} disabled={busy} />
      </FormField>

      <View className="gap-2">
        <Text className="text-caption text-text-muted">Membership term</Text>
        <View className="gg-panel" accessible>
          <Text className="text-body-lg text-text-primary">{request.term.label}</Text>
          <Text className="text-caption text-text-muted">{termEndsLine(request.term)}</Text>
        </View>
      </View>

      <View className="gg-card gap-2">
        <MemberLabel label={label} />
        <Text className="text-body text-text-secondary">
          {request.name} gets this label and the member perk on their GRIDGO account.
        </Text>
      </View>

      <View className="gap-3">
        {actionError ? <ProblemLine message={actionError} /> : null}
        <PrimaryButton
          label={acting?.startsWith("approve") ? "Approving…" : "Approve member"}
          disabled={busy}
          onPress={() => void approve()}
        />
        <SecondaryButton
          label={acting?.startsWith("decline") ? "Declining…" : "Decline"}
          disabled={busy}
          onPress={() => setDeclining(true)}
        />
      </View>

      <ConfirmDialog
        visible={declining}
        question={`Decline ${request.name}?`}
        body="They are told it was not approved. They can ask again with your link if this was a mistake."
        confirmLabel="Decline request"
        cancelLabel="Keep request"
        onConfirm={() => {
          setDeclining(false);
          void useOrganizationMembers
            .getState()
            .decline(request)
            .then((declined) => {
              if (declined) router.back();
            });
        }}
        onCancel={() => setDeclining(false)}
      />
    </>
  );
}
