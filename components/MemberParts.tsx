import { BadgeCheck } from "lucide-react-native";
import { Text, View } from "react-native";

import { useThemeColors } from "@/hooks/useTheme";
import { formatPhp } from "@/lib/api";
import { memberPerkLabel, memberPerkNote, memberPerkOf, orgInitials } from "@/lib/memberships";
import { discountAmount } from "@/lib/organization";

/** The organization's tile. Initials only: GRIDGO holds no logo for an organization. */
export function OrgTile({ entry, size = 44 }: { entry: { label: string }; size?: number }) {
  return (
    <View
      className="items-center justify-center rounded-field bg-accent"
      style={{ width: size, height: size }}
      aria-hidden
    >
      <Text className="text-button text-accent-on" numberOfLines={1} allowFontScaling={false}>
        {orgInitials(entry)}
      </Text>
    </View>
  );
}

/** "✓ Sample Guild member": the label a confirmed member carries. */
export function MemberChip({ label }: { label: string }) {
  const colors = useThemeColors();
  return (
    <View className="gg-chip max-w-full border-success" testID="member-chip">
      <BadgeCheck size={14} color={colors.success} strokeWidth={2} aria-hidden />
      <Text className="shrink text-caption font-medium text-text-primary" numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

type PerkSource = Parameters<typeof memberPerkOf>[0];

/**
 * "Sample Guild member −₱10.00", wherever a client reads what an order costs.
 *
 * GRIDGO sends the perk already out of the total, so this row explains a total
 * rather than changing it. `label` names a share of a basket's one perk.
 */
export function MemberPerkRow({ source, label, divider = true }: { source: PerkSource; label?: string; divider?: boolean }) {
  const minor = memberPerkOf(source);
  if (!minor) return null;
  const name = label ?? memberPerkLabel(source);
  return (
    <View
      className={`flex-row items-baseline justify-between gap-4 py-3 ${divider ? "border-b border-outline-subtle" : ""}`}
      accessible
      accessibilityLabel={`${name}, minus ${formatPhp(minor)}`}
      testID="member-perk-row"
    >
      <Text className="min-w-0 shrink text-body text-text-secondary">{name}</Text>
      <Text className="shrink-0 text-right text-body font-medium text-success">{discountAmount(minor)}</Text>
    </View>
  );
}

/** Under the money: which use this is, and how many are left. Nothing to do. */
export function MemberPerkNote({ source }: { source: PerkSource }) {
  const colors = useThemeColors();
  const note = memberPerkNote(source);
  if (!note) return null;
  return (
    <View className="flex-row items-start gap-2" testID="member-perk-note">
      <BadgeCheck size={16} color={colors.success} strokeWidth={2} aria-hidden />
      <Text className="min-w-0 flex-1 text-caption text-text-secondary">{note}</Text>
    </View>
  );
}
