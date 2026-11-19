import { Check, ChevronDown, Zap, type LucideIcon } from "lucide-react-native";
import type { ReactNode } from "react";
import { Platform, Pressable, Text, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";

import { HeaderNotificationBell } from "@/components/HeaderNotificationBell";
import { PushedHeaderActions } from "@/components/PushedHeaderActions";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { useThemeColors } from "@/hooks/useTheme";
import type { ExpressStep } from "@/store/express";

/** The header's mark: this is Express, not a custom print. */
export function ExpressPill() {
  const colors = useThemeColors();
  return (
    <View
      accessible
      accessibilityLabel="Express"
      className="mr-2 flex-row items-center gap-1 rounded-pill bg-action-yellow px-2.5 py-1"
    >
      <Zap size={12} color={colors.actionYellowOn} fill={colors.actionYellowOn} strokeWidth={2} aria-hidden />
      <Text className="text-caption font-bold text-action-yellow-on">EXPRESS</Text>
    </View>
  );
}

/**
 * The Express header's right side: the pill, then the bell every pushed
 * screen carries (#230) — and on Android the theme switch beside it.
 */
export function ExpressHeaderActions() {
  return (
    <View className="flex-row items-center">
      <ExpressPill />
      {Platform.OS === "android" ? <PushedHeaderActions /> : <HeaderNotificationBell />}
    </View>
  );
}

const STEPS: { key: ExpressStep; label: string }[] = [
  { key: "files", label: "Files" },
  { key: "preview", label: "Preview" },
  { key: "pay", label: "Pay" },
];

/**
 * Files · Preview · Pay. Every step is a button; one not reachable yet is
 * drawn quiet and does nothing. The current step is the bar's one yellow.
 */
export function ExpressStepBar({
  step,
  canGo,
  onStep,
}: {
  step: ExpressStep;
  canGo: (step: ExpressStep) => boolean;
  onStep: (step: ExpressStep) => void;
}) {
  const colors = useThemeColors();
  const currentIndex = STEPS.findIndex((entry) => entry.key === step);
  return (
    <View className="flex-row items-center gap-1.5 px-4 pb-2 pt-1" accessibilityRole="tablist">
      {STEPS.map((entry, index) => {
        const current = entry.key === step;
        const done = index < currentIndex;
        const enabled = !current && canGo(entry.key);
        return (
          <Pressable
            key={entry.key}
            onPress={() => enabled && onStep(entry.key)}
            disabled={!enabled}
            accessibilityRole="tab"
            accessibilityLabel={entry.label}
            accessibilityState={{ selected: current, disabled: !enabled && !current }}
            className="gg-touch flex-1 justify-center"
          >
            <View
              className={
                current
                  ? "h-9 flex-row items-center justify-center gap-1.5 rounded-pill bg-action-yellow"
                  : "h-9 flex-row items-center justify-center gap-1.5 rounded-pill border border-outline bg-surface"
              }
              style={!current && !enabled && !done ? { opacity: 0.5 } : undefined}
            >
              {done ? <Check size={14} color={colors.success} strokeWidth={2.5} aria-hidden /> : null}
              <Text
                className={
                  current ? "text-button text-action-yellow-on" : "text-body font-medium text-text-secondary"
                }
              >
                {entry.label}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * One accordion row: icon, name, the current value, and a chevron. The screen
 * keeps one open at a time, so the page never grows past the phone.
 */
export function ExpressRow({
  icon: Icon,
  title,
  value,
  open,
  onToggle,
  divided = true,
  children,
  trailing,
}: {
  icon: LucideIcon;
  title: string;
  value: string;
  open?: boolean;
  /** Absent for a row that opens a sheet instead of folding open. */
  onToggle?: () => void;
  divided?: boolean;
  children?: ReactNode;
  /** Replaces the chevron, for a row whose control sits inline. */
  trailing?: ReactNode;
}) {
  const colors = useThemeColors();
  const reducedMotion = useReducedMotion();
  const folds = children !== undefined;
  return (
    <View className={divided ? "border-t border-outline-subtle" : undefined}>
      {trailing ? (
        // An inline control is its own button; the row around it is not one.
        <View className="min-h-12 flex-row items-center gap-3 px-4 py-2.5">
          <Icon size={18} color={colors.textSecondary} strokeWidth={2} aria-hidden />
          <Text className="min-w-0 flex-1 text-body font-medium text-text-primary">{title}</Text>
          {trailing}
        </View>
      ) : (
        <Pressable
          onPress={onToggle}
          accessibilityRole="button"
          accessibilityLabel={`${title}: ${value}`}
          accessibilityState={folds ? { expanded: Boolean(open) } : undefined}
          className="min-h-12 flex-row items-center gap-3 px-4 py-2.5"
          style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
        >
          <Icon size={18} color={colors.textSecondary} strokeWidth={2} aria-hidden />
          <Text className="text-body font-medium text-text-primary">{title}</Text>
          <Text className="min-w-0 flex-1 text-right text-body text-text-secondary" numberOfLines={1}>
            {value}
          </Text>
          <View style={folds && open ? { transform: [{ rotate: "180deg" }] } : folds ? undefined : { transform: [{ rotate: "-90deg" }] }}>
            <ChevronDown size={18} color={colors.textMuted} strokeWidth={2} aria-hidden />
          </View>
        </Pressable>
      )}
      {folds && open ? (
        <Animated.View entering={reducedMotion ? undefined : FadeIn.duration(180)} className="px-4 pb-3">
          {children}
        </Animated.View>
      ) : null}
    </View>
  );
}

/** A row of choices inside an open accordion row. One is selected, drawn in ink, never yellow. */
export function ChoiceChips<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: string; detail?: string }[];
  value: T;
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <View className="flex-row gap-2" accessibilityRole="radiogroup" accessibilityLabel={label}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={option.detail ? `${option.label}, ${option.detail}` : option.label}
            className={
              selected
                ? "min-h-11 flex-1 items-center justify-center rounded-field border border-accent bg-accent px-2 py-1.5"
                : "min-h-11 flex-1 items-center justify-center rounded-field border border-outline bg-surface px-2 py-1.5"
            }
          >
            <Text className={selected ? "text-button text-accent-on" : "text-button text-text-primary"} numberOfLines={1}>
              {option.label}
            </Text>
            {option.detail ? (
              <Text className={selected ? "text-caption text-accent-on" : "text-caption text-text-muted"} numberOfLines={1}>
                {option.detail}
              </Text>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}
