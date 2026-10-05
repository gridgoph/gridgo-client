import { router } from "expo-router";
import { BadgePercent, Building2, ChevronRight } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";

import { useThemeColors } from "@/hooks/useTheme";
import { canApplyAsBusiness } from "@/lib/accountProfile";
import {
  discountAmount,
  ORGANIZATION_DISCOUNT_LABEL,
  organizationDiscountOf,
  savedLine,
} from "@/lib/organization";
import { useSession } from "@/store/session";

/**
 * The organization discount (gridgo-client#166), shown wherever a client
 * reads what an order costs.
 *
 * GRIDGO sends the discount already taken out of the total, so this line
 * explains a total rather than changing it: Printing − discount + delivery =
 * Total. It never names GRIDGO's fee, which funds the discount and stays
 * inside Printing as everywhere else.
 */
export function OrganizationDiscountRow({
  source,
}: {
  source: { organizationDiscountMinor?: number | null } | null | undefined;
}) {
  const minor = organizationDiscountOf(source);
  if (!minor) return null;
  return (
    <View
      className="flex-row items-baseline justify-between gap-4 border-b border-outline-subtle py-3"
      accessible
      accessibilityLabel={`${ORGANIZATION_DISCOUNT_LABEL}, minus ${discountAmount(minor).slice(1)}`}
      testID="organization-discount-row"
    >
      <Text className="shrink-0 text-body text-text-secondary">{ORGANIZATION_DISCOUNT_LABEL}</Text>
      <Text className="shrink text-right text-body font-medium text-success">{discountAmount(minor)}</Text>
    </View>
  );
}

/**
 * Under checkout's money card: what the organization saved on this order, or —
 * for a client who is not an organization yet — the one quiet nudge to become
 * one. Neither is shown while an application is already with Operations.
 */
export function OrganizationSavingsNote({
  source,
}: {
  source: { organizationDiscountMinor?: number | null } | null | undefined;
}) {
  const colors = useThemeColors();
  const user = useSession((s) => s.user);
  const minor = organizationDiscountOf(source);

  if (minor) {
    return (
      <View className="flex-row items-center gap-2" testID="organization-savings">
        <BadgePercent size={16} color={colors.success} strokeWidth={2} aria-hidden />
        <Text className="min-w-0 flex-1 text-body text-success">{savedLine(minor)}</Text>
      </View>
    );
  }

  // Only a personal account is nudged: a declared business is offered the
  // checklist on Account already, and a pending one is waiting on Operations.
  if (!user || (user.accountType ?? "individual") !== "individual" || !canApplyAsBusiness(user)) return null;

  return (
    <Pressable
      onPress={() => router.push("/business-apply")}
      accessibilityRole="button"
      accessibilityLabel="Ordering for a school organization? Register it to get the organization discount"
      className="gg-touch flex-row items-center gap-3 rounded-card border border-outline bg-surface-variant px-4 py-3"
      style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
      testID="organization-nudge"
    >
      <Building2 size={20} color={colors.textSecondary} strokeWidth={2} aria-hidden />
      <View className="min-w-0 flex-1 gap-0.5">
        <Text className="text-body font-medium text-text-primary">Ordering for a school organization?</Text>
        <Text className="text-caption text-text-secondary">
          Register it and every order gets the organization discount, shown right here.
        </Text>
      </View>
      <ChevronRight size={18} color={colors.textMuted} aria-hidden />
    </Pressable>
  );
}
