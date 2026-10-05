import { router } from "expo-router";
import { ShieldCheck } from "lucide-react-native";
import { Text, View } from "react-native";

import { PrimaryButton } from "@/components/PrimaryButton";
import { SecondaryButton } from "@/components/SecondaryButton";
import { StatusChip } from "@/components/StatusChip";
import { useThemeColors } from "@/hooks/useTheme";
import type { ClientOrganization } from "@/lib/api";
import {
  confirmOfficerQuestion,
  manilaDay,
  officerState,
} from "@/lib/organization";

/**
 * The officer of record (gridgo-client#164): the one verified person who
 * answers for the organization, and whose name prints on invoices and
 * statements for orders placed while they hold it.
 *
 * The name is the heading because it is the fact a treasurer is checking.
 * Every state is said in words beside its chip — handover pending, handover
 * not approved, no officer yet — so nothing rests on colour.
 */
export function OfficerCard({ organization }: { organization: ClientOrganization | null }) {
  const colors = useThemeColors();
  const state = officerState(organization);
  const officer = organization?.currentOfficer ?? null;

  if (state === "no_officer") {
    return (
      <View className="gg-card gap-3" testID="officer-card">
        <Text className="text-overline text-text-muted">OFFICER OF RECORD</Text>
        <Text className="text-h3 text-text-primary">No verified officer yet</Text>
        <Text className="text-body text-text-secondary">
          Verify the officer who answers for this organization. Their name goes on every invoice
          and statement from then on.
        </Text>
        <PrimaryButton
          label="Verify your officer"
          onPress={() => router.push({ pathname: "/business-apply", params: { mode: "first_officer" } })}
        />
      </View>
    );
  }

  const verified = manilaDay(officer?.verifiedAt ?? officer?.startedAt);
  const nextCheck = manilaDay(organization?.nextConfirmationAt);

  return (
    <View className="gg-card gap-4" testID="officer-card">
      <View className="flex-row items-center justify-between gap-2">
        <Text className="text-overline text-text-muted">OFFICER OF RECORD</Text>
        {state === "handover_pending" ? (
          <StatusChip tone="info" label="Change with Operations" icon="clock" />
        ) : state === "handover_rejected" ? (
          <StatusChip tone="error" label="Change not approved" icon="circle-x" />
        ) : state === "confirmation_due" ? (
          <StatusChip tone="warning" label="Check due" icon="triangle-alert" />
        ) : (
          <StatusChip tone="success" label="Verified" icon="circle-check" />
        )}
      </View>

      <View className="flex-row items-center gap-3">
        <View className="h-12 w-12 items-center justify-center rounded-pill bg-surface-variant">
          <ShieldCheck size={22} color={colors.textPrimary} strokeWidth={2} aria-hidden />
        </View>
        <View className="min-w-0 flex-1 gap-0.5">
          <Text className="text-h2 text-text-primary" numberOfLines={2}>
            {officer?.fullName ?? "—"}
          </Text>
          <Text className="text-caption text-text-muted">
            {verified ? `Verified ${verified}` : "Verified by Operations"}
            {nextCheck && state !== "handover_pending" ? ` · Next check ${nextCheck}` : ""}
          </Text>
        </View>
      </View>

      {state === "handover_pending" ? (
        <Text className="text-body text-text-secondary">
          A new officer&apos;s details are with Operations. {officer?.fullName} stays the officer of
          record until they approve, and orders keep going in their name. Ordering is not paused.
        </Text>
      ) : state === "handover_rejected" ? (
        <Text className="text-body text-text-secondary">
          Operations did not approve the new officer, so {officer?.fullName} is still the officer
          of record. You can start the change again with fresh documents.
        </Text>
      ) : (
        <Text className="text-body text-text-secondary">
          Printed on every invoice and statement for orders placed while they are the officer.
        </Text>
      )}

      {state === "handover_pending" ? null : (
        <SecondaryButton
          label={state === "handover_rejected" ? "Start the change again" : "Change officer"}
          onPress={() => router.push("/officer-handover")}
        />
      )}
    </View>
  );
}

/**
 * The quarterly question (gridgo-client#165), answered in one tap. "No" is
 * the handover, because a different officer has to verify, not just be named.
 */
export function OfficerReminderCard({
  organization,
  confirming,
  error,
  onConfirm,
}: {
  organization: ClientOrganization | null;
  confirming: boolean;
  error: string | null;
  onConfirm: () => void;
}) {
  const name = organization?.currentOfficer?.fullName ?? "your officer";
  return (
    <View className="gap-4 rounded-card border border-warning bg-surface p-4" testID="officer-reminder">
      <StatusChip tone="warning" label="Quarterly check" icon="triangle-alert" />
      <View className="gap-2">
        <Text className="text-h3 text-text-primary" accessibilityRole="header">
          Is {name} still your officer?
        </Text>
        <Text className="text-body text-text-secondary">
          GRIDGO asks every three months, so the name on your invoices and statements stays
          right when officers change.
        </Text>
      </View>
      {error ? <Text className="text-body text-error">{error}</Text> : null}
      <View className="gap-3">
        <PrimaryButton
          label={confirming ? "Confirming…" : confirmOfficerQuestion(organization)}
          disabled={confirming}
          onPress={onConfirm}
        />
        <SecondaryButton
          label="No, change officer"
          disabled={confirming}
          onPress={() => router.push("/officer-handover")}
        />
      </View>
    </View>
  );
}
