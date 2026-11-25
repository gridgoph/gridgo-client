import { CircleCheck, X } from "lucide-react-native";
import { useState } from "react";
import { Text, View } from "react-native";

import { ConfirmDialog } from "@/components/ConfirmDialog";
import { OrgTile } from "@/components/MemberParts";
import { Pressable } from "@/components/Pressable";
import { useThemeColors } from "@/hooks/useTheme";
import { memberSinceLabel, offerLine, orgFullName, withArticle } from "@/lib/memberships";
import type { Membership, MembershipMatch } from "@/lib/membershipsApi";
import { useMemberships } from "@/store/memberships";

/**
 * An officer's list names this person. One tap makes it true; "Not me" takes
 * them off it. Nothing is claimed before the tap, so the card says where the
 * name came from.
 */
export function MemberMatchCard({ match }: { match: MembershipMatch }) {
  const busy = useMemberships((state) => state.busyId !== null);
  const working = useMemberships((state) => state.busyId === match.id);
  const error = useMemberships((state) => (state.actionError?.id === match.id ? state.actionError.message : null));
  const [askingNotMe, setAskingNotMe] = useState(false);
  const since = memberSinceLabel(match.memberSince);
  const offer = offerLine(match.perk);
  const full = orgFullName(match);

  return (
    <View className="gg-card gap-3 py-3" testID="member-match-card">
      <View className="flex-row items-center gap-3">
        <OrgTile entry={match} />
        <View className="min-w-0 flex-1">
          <Text className="text-body-lg font-bold text-text-primary" numberOfLines={2} accessibilityRole="header">
            You’re {withArticle(match.label)}
          </Text>
          <Text className="text-caption text-text-secondary" numberOfLines={2}>
            {since ? `Member since ${since} · from your org’s list` : "From your org’s list"}
            {full ? ` · ${full}` : ""}
          </Text>
          {offer ? <Text className="text-caption text-text-primary">{offer}</Text> : null}
        </View>
      </View>
      {error ? (
        <Text className="text-caption text-error" accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
      <View className="flex-row items-center gap-3">
        <Pressable
          onPress={() => void useMemberships.getState().confirm(match.id)}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel={`Confirm you are ${withArticle(match.label)}`}
          accessibilityState={{ disabled: busy }}
          className={busy ? "gg-btn-primary gg-disabled flex-1" : "gg-btn-primary flex-1"}
        >
          <Text className="text-button text-action-yellow-on">{working ? "Confirming…" : "Tap to confirm"}</Text>
        </Pressable>
        <Pressable
          onPress={() => setAskingNotMe(true)}
          disabled={busy}
          accessibilityRole="button"
          accessibilityState={{ disabled: busy }}
          className="gg-touch items-center justify-center px-3"
          style={({ pressed }) => (pressed ? { opacity: 0.6 } : undefined)}
        >
          <Text className="text-button text-text-secondary">Not me</Text>
        </Pressable>
      </View>

      <ConfirmDialog
        visible={askingNotMe}
        question={`Not ${withArticle(match.label)}?`}
        body="GRIDGO takes you off this list and stops asking. You can still join later with the organization’s link or QR."
        confirmLabel="Not me"
        cancelLabel="Keep it"
        onConfirm={() => {
          setAskingNotMe(false);
          void useMemberships.getState().dismiss(match.id);
        }}
        onCancel={() => setAskingNotMe(false)}
      />
    </View>
  );
}

/** Straight after the tap: it worked, and what it changes. */
export function MemberConfirmedCard({
  membership,
  onOpen,
  onDismiss,
}: {
  membership: Membership;
  onOpen: () => void;
  onDismiss: () => void;
}) {
  const colors = useThemeColors();
  const perk = membership.perk && membership.perk.available && membership.perk.left > 0;
  return (
    <View className="gg-card-flush flex-row items-center pl-4" testID="member-confirmed-card" accessibilityLiveRegion="polite">
      <CircleCheck size={24} color={colors.success} strokeWidth={2} aria-hidden />
      <Pressable
        onPress={onOpen}
        accessibilityRole="button"
        accessibilityLabel={`You are ${withArticle(membership.label)}. Open My orgs`}
        className="gg-touch min-w-0 flex-1 justify-center px-3 py-3"
        style={({ pressed }) => (pressed ? { opacity: 0.6 } : undefined)}
      >
        <Text className="text-body-lg font-bold text-text-primary" numberOfLines={2}>
          You’re {withArticle(membership.label)}
        </Text>
        {perk ? <Text className="text-caption text-text-secondary">Your perk comes off at checkout by itself</Text> : null}
        <Text className="text-caption text-text-primary underline">See My orgs</Text>
      </Pressable>
      <Pressable
        onPress={onDismiss}
        accessibilityRole="button"
        accessibilityLabel="Dismiss"
        className="gg-touch items-center justify-center"
        style={({ pressed }) => ({ width: 44, height: 44, opacity: pressed ? 0.6 : 1 })}
      >
        <X size={18} color={colors.textMuted} strokeWidth={2} />
      </Pressable>
    </View>
  );
}
