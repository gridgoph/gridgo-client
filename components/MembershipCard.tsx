import { CalendarCheck, Clock } from "lucide-react-native";
import { useState } from "react";
import { Text, View } from "react-native";

import { ConfirmDialog } from "@/components/ConfirmDialog";
import { OrgTile } from "@/components/MemberParts";
import { Pressable } from "@/components/Pressable";
import { StatusChip } from "@/components/StatusChip";
import { useThemeColors } from "@/hooks/useTheme";
import { formatPhp } from "@/lib/api";
import {
  lastDay,
  leftLine,
  memberSinceLabel,
  orgFullName,
  orgName,
  perkPause,
  upToLine,
  usedLine,
} from "@/lib/memberships";
import type { Membership, MembershipPerk } from "@/lib/membershipsApi";
import { manilaDay } from "@/lib/organization";
import { useMemberships } from "@/store/memberships";

const CHIP = {
  active: { tone: "success", label: "Member", icon: "circle-check" },
  pending: { tone: "warning", label: "Waiting for approval", icon: "clock" },
  expired: { tone: "neutral", label: "Term ended", icon: "clock" },
} as const;

/** One organization in My orgs: where it stands, what it gives, the way out. */
export function MembershipCard({ membership }: { membership: Membership }) {
  const colors = useThemeColors();
  const status = membership.status === "removed" ? "expired" : membership.status;
  const chip = CHIP[status];
  const since = memberSinceLabel(membership.memberSince);
  const full = orgFullName(membership);
  return (
    <View className="gg-card gap-4" testID={`membership-${membership.id}`}>
      <View className="flex-row items-center gap-3">
        <OrgTile entry={membership} />
        <View className="min-w-0 flex-1">
          <Text className="text-body-lg font-bold text-text-primary" numberOfLines={2} accessibilityRole="header">
            {orgName(membership)}
          </Text>
          {full ? (
            <Text className="text-caption text-text-secondary" numberOfLines={2}>
              {full}
            </Text>
          ) : null}
          {status === "pending" ? (
            <Text className="text-caption text-text-secondary">Asked {manilaDay(membership.requestedAt) ?? "recently"}</Text>
          ) : since ? (
            <Text className="text-caption text-text-secondary">Member since {since}</Text>
          ) : null}
        </View>
      </View>
      <View className="flex-row">
        <StatusChip tone={chip.tone} label={chip.label} icon={chip.icon} />
      </View>

      {status === "active" ? <ActiveBody membership={membership} /> : null}
      {status === "pending" ? (
        <View className="flex-row items-start gap-2">
          <Clock size={16} color={colors.textSecondary} strokeWidth={2} aria-hidden />
          <Text className="min-w-0 flex-1 text-body text-text-secondary">
            The officer checks each request. You get a notice when they answer, and you can keep ordering meanwhile.
          </Text>
        </View>
      ) : null}
      {status === "expired" ? (
        <View className="gap-1">
          <Text className="text-body text-text-secondary">
            {membership.term.label} ended. The officer can renew you for the new term, and your member since date stays.
          </Text>
          {membership.totalSavedMinor > 0 ? (
            <Text className="text-caption text-text-muted">You saved {formatPhp(membership.totalSavedMinor)} as a member.</Text>
          ) : null}
        </View>
      ) : null}

      <EndAction membership={membership} pending={status === "pending"} />
    </View>
  );
}

function ActiveBody({ membership }: { membership: Membership }) {
  const perk = membership.perk;
  const pause = perkPause(membership);
  return (
    <View className="gap-3">
      {perk ? <PerkPanel perk={perk} pause={pause} /> : null}
      {!perk && pause ? <Text className="text-body text-text-secondary">{pause}</Text> : null}
      {membership.totalSavedMinor > 0 ? (
        <View
          className="flex-row items-baseline justify-between gap-3"
          accessible
          accessibilityLabel={`You have saved ${formatPhp(membership.totalSavedMinor)}`}
        >
          <Text className="text-body text-text-secondary">You’ve saved</Text>
          <Text className="text-h3 text-success">{formatPhp(membership.totalSavedMinor)}</Text>
        </View>
      ) : null}
    </View>
  );
}

function PerkPanel({ perk, pause }: { perk: MembershipPerk; pause: string | null }) {
  const colors = useThemeColors();
  const until = lastDay(perk.validUntil);
  const share = perk.maxOrdersPerTerm > 0 ? Math.min(1, Math.max(0, perk.used / perk.maxOrdersPerTerm)) : 0;
  return (
    <View className="gg-panel gap-3" testID="member-perk-panel">
      <View>
        <Text className="text-h3 text-text-primary">{upToLine(perk)}</Text>
        <Text className="text-caption text-text-secondary">
          {pause ? "Your member perk" : "each order · comes off at checkout by itself"}
        </Text>
      </View>
      <View
        className="h-2 overflow-hidden rounded-pill bg-outline"
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel={`${usedLine(perk)}, ${leftLine(perk)}`}
        accessibilityValue={{ min: 0, max: perk.maxOrdersPerTerm, now: perk.used }}
      >
        <View className="h-2 rounded-pill" style={{ width: `${share * 100}%`, backgroundColor: colors.accent }} />
      </View>
      <View className="flex-row flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <Text className="text-caption font-medium text-text-primary">{usedLine(perk)}</Text>
        <Text className="text-caption text-text-secondary">{leftLine(perk)}</Text>
      </View>
      {until ? (
        <View className="flex-row items-center gap-2">
          <CalendarCheck size={14} color={colors.textSecondary} strokeWidth={2} aria-hidden />
          <Text className="text-caption text-text-secondary">Valid until {until}</Text>
        </View>
      ) : null}
      {pause ? <Text className="text-caption text-text-primary">{pause}</Text> : null}
    </View>
  );
}

/** Cancel a request, or leave. Both ask first; leaving says what stays. */
function EndAction({ membership, pending }: { membership: Membership; pending: boolean }) {
  const busy = useMemberships((state) => state.busyId !== null);
  const working = useMemberships((state) => state.busyId === membership.id);
  const error = useMemberships((state) =>
    state.actionError?.id === membership.id ? state.actionError.message : null,
  );
  const [asking, setAsking] = useState(false);
  const name = orgName(membership);
  const label = pending ? "Cancel request" : `Leave ${name}`;
  return (
    <View className="gap-2">
      {error ? (
        <Text className="text-caption text-error" accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
      <View className="-mb-2 flex-row border-t border-outline-subtle pt-1">
        <Pressable
          onPress={() => setAsking(true)}
          disabled={busy}
          accessibilityRole="button"
          accessibilityState={{ disabled: busy }}
          className={busy ? "gg-touch gg-disabled justify-center" : "gg-touch justify-center"}
          style={({ pressed }) => (pressed ? { opacity: 0.6 } : undefined)}
        >
          <Text className="text-button text-text-secondary">{working ? "Working…" : label}</Text>
        </Pressable>
      </View>
      <ConfirmDialog
        visible={asking}
        question={pending ? `Cancel your request to ${name}?` : `Leave ${name}?`}
        body={
          pending
            ? "The officer stops seeing it. You can ask again with the same link or QR."
            : "Your member label and perk stop now. Your past orders stay as they are, and you would need the officer to join again."
        }
        confirmLabel={pending ? "Cancel request" : "Leave"}
        cancelLabel={pending ? "Keep waiting" : "Stay"}
        tone="destructive"
        onConfirm={() => {
          setAsking(false);
          void useMemberships.getState().end(membership.id);
        }}
        onCancel={() => setAsking(false)}
      />
    </View>
  );
}
