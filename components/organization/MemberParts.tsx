import { Award, Check, ChevronRight, CircleAlert } from "lucide-react-native";
import { router } from "expo-router";
import type { ReactNode } from "react";
import { Text, View } from "react-native";

import { EmptyState } from "@/components/EmptyState";
import { Pressable } from "@/components/Pressable";
import { OptionPicker } from "@/components/form/OptionPicker";
import { useThemeColors } from "@/hooks/useTheme";
import {
  memberMonthOptions,
  memberYearOptions,
  PARTNER_BADGE,
  withYear,
  type MonthPick,
} from "@/lib/organizationMembers";
import { useOrganizationMembers } from "@/store/organizationMembers";

/** The small parts the officer's member screens share (gridgo-client#474). */

/** Said on Account while GRIDGO counts this organization as a partner with the badge. */
export function PartnerBadge() {
  const colors = useThemeColors();
  return (
    <View className="gg-chip" style={{ borderColor: colors.brand }} testID="partner-badge">
      <Award size={14} color={colors.brand} strokeWidth={2} aria-hidden />
      <Text className="text-caption font-medium text-text-primary">{PARTNER_BADGE}</Text>
    </View>
  );
}

/** The label a member carries, shown to the officer exactly as members see it. */
export function MemberLabel({ label }: { label: string }) {
  const colors = useThemeColors();
  return (
    <View className="gg-chip self-start" style={{ borderColor: colors.brand }}>
      <Check size={13} color={colors.brand} strokeWidth={2.5} aria-hidden />
      <Text className="text-caption font-medium text-text-primary">{label} member</Text>
    </View>
  );
}

/** One place to go, and a line saying what is there. */
export function LinkRow({
  title,
  detail,
  onPress,
  divided = false,
  boxed = false,
}: {
  title: string;
  detail: string;
  onPress: () => void;
  divided?: boolean;
  /** Stands on its own, as Account's rows do, instead of inside a shared card. */
  boxed?: boolean;
}) {
  const colors = useThemeColors();
  const edge = boxed ? " rounded-card border border-outline bg-surface" : divided ? " border-t border-outline-subtle" : "";
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={detail}
      className={`gg-touch flex-row items-center gap-3 px-4 py-3${edge}`}
      style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
    >
      <View className="min-w-0 flex-1 gap-0.5">
        <Text className="text-body-lg font-medium text-text-primary">{title}</Text>
        <Text className="text-caption text-text-muted" numberOfLines={2}>
          {detail}
        </Text>
      </View>
      <ChevronRight size={20} color={colors.textMuted} aria-hidden />
    </Pressable>
  );
}

/** One figure and what it counts. */
export function StatTile({ value, label }: { value: string; label: string }) {
  return (
    <View className="min-w-0 shrink gap-1" accessible accessibilityLabel={`${label}: ${value}`}>
      <Text className="text-h3 text-text-primary" numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text className="text-caption text-text-muted">{label}</Text>
    </View>
  );
}

/** Something landed. Announced, and quiet enough to leave on screen. */
export function DoneLine({ message }: { message: string }) {
  const colors = useThemeColors();
  return (
    <View className="flex-row items-center gap-2" accessibilityLiveRegion="polite">
      <Check size={16} color={colors.success} strokeWidth={2.5} aria-hidden />
      <Text className="min-w-0 flex-1 text-body text-success">{message}</Text>
    </View>
  );
}

/** Something did not land, beside the control it belongs to. */
export function ProblemLine({ message }: { message: string }) {
  const colors = useThemeColors();
  return (
    <View className="flex-row items-start gap-2" accessibilityRole="alert">
      <View className="pt-0.5">
        <CircleAlert size={16} color={colors.error} strokeWidth={2} aria-hidden />
      </View>
      <Text className="min-w-0 flex-1 text-body text-error">{message}</Text>
    </View>
  );
}

/** A refresh failed while older rows are still on screen: say so, and offer it again. */
export function NotFresh({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <View className="gg-panel gap-2" accessibilityRole="alert">
      <Text className="text-body text-text-secondary">{message} What you see is from before.</Text>
      <TextButton label="Try again" onPress={onRetry} />
    </View>
  );
}

/** A quiet action: full touch height, no border. */
export function TextButton({ label, onPress, disabled = false, tone = "normal" }: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  tone?: "normal" | "error";
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      className={disabled ? "gg-touch gg-disabled items-center justify-center px-3" : "gg-touch items-center justify-center px-3"}
      style={({ pressed }) => (pressed ? { opacity: 0.6 } : undefined)}
    >
      <Text className={tone === "error" ? "text-button text-error" : "text-button text-text-primary underline"}>{label}</Text>
    </Pressable>
  );
}

/** Two or more views of one thing, monochrome. */
export function Segments<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <View className="flex-row rounded-field border border-outline bg-surface-variant p-1" accessibilityRole="tablist">
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={option.label}
            className={
              selected
                ? "min-h-11 flex-1 items-center justify-center rounded-md bg-surface-high"
                : "min-h-11 flex-1 items-center justify-center rounded-md"
            }
            style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
          >
            <Text className={selected ? "text-button text-text-primary" : "text-body text-text-muted"}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * The month and year somebody joined. Two short lists rather than a calendar:
 * nobody remembers the day, and the choices cannot name the future. It never
 * starts on today, because today is when they asked, not when they joined.
 */
export function MemberSinceField({
  pick,
  onChange,
  disabled = false,
}: {
  pick: MonthPick;
  onChange: (pick: MonthPick) => void;
  disabled?: boolean;
}) {
  return (
    <View className="flex-row gap-3">
      <View className="min-w-0 flex-[3]">
        <OptionPicker
          title="Month they joined"
          value={pick.month}
          options={memberMonthOptions(pick.year)}
          onChange={(month) => onChange({ ...pick, month })}
          placeholder="Month"
          accessibilityLabel="Month they joined"
          disabled={disabled}
        />
      </View>
      <View className="min-w-0 flex-[2]">
        <OptionPicker
          title="Year they joined"
          value={pick.year}
          options={memberYearOptions()}
          onChange={(year) => onChange(withYear(pick, year))}
          placeholder="Year"
          accessibilityLabel="Year they joined"
          disabled={disabled}
        />
      </View>
    </View>
  );
}

/** Every member screen's door: GRIDGO said this account is not a live partner. */
export function PartnerGate({ children }: { children: ReactNode }) {
  const partner = useOrganizationMembers((s) => s.partner);
  if (partner !== "none") return <>{children}</>;
  return (
    <View className="gg-page pt-6">
      <EmptyState
        title="For GRIDGO partner organizations"
        body="Members, the member perk and liquidation records open here while your organization is a GRIDGO partner with a verified officer. Message GRIDGO if you think this is wrong."
        actionLabel="Go to Account"
        onAction={() => router.navigate("/(tabs)/account")}
      />
    </View>
  );
}
