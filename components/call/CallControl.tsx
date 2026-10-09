import type { LucideIcon } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";

import { useThemeColors } from "@/hooks/useTheme";

type Tone = "neutral" | "on" | "danger" | "success";

type Props = {
  icon: LucideIcon;
  label: string;
  onPress: () => void;
  tone?: Tone;
  /** 64 for a toggle, 72 for answer, decline and end. */
  size?: number;
  accessibilityLabel?: string;
  /** Set for a toggle (mute, speaker): it is a switch, and says whether it is on. */
  checked?: boolean;
  disabled?: boolean;
};

/**
 * One of the round controls on the call screen, always with its word under it.
 *
 * Colour never carries it alone: green and red are the convention every phone
 * uses for answer and hang up, and each still says Accept, Decline or End. A
 * toggle that is on fills with the monochrome accent rather than yellow — the
 * call screen's yellow is kept for "Call again".
 */
export function CallControl({
  icon: Icon,
  label,
  onPress,
  tone = "neutral",
  size = 64,
  accessibilityLabel,
  checked,
  disabled,
}: Props) {
  const colors = useThemeColors();
  const fill =
    tone === "danger"
      ? colors.error
      : tone === "success"
        ? colors.success
        : tone === "on"
          ? colors.accent
          : colors.surface;
  const ink = tone === "neutral" ? colors.textPrimary : colors.accentOn;
  const toggle = checked !== undefined;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole={toggle ? "switch" : "button"}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={toggle ? { checked, disabled: Boolean(disabled) } : { disabled: Boolean(disabled) }}
      className="items-center gap-2"
      style={{ minWidth: size + 16, opacity: disabled ? 0.38 : 1 }}
    >
      {({ pressed }) => (
        <>
          <View
            className={tone === "neutral" ? "items-center justify-center border border-outline" : "items-center justify-center"}
            style={{
              width: size,
              height: size,
              borderRadius: size / 2,
              backgroundColor: fill,
              transform: [{ scale: pressed ? 0.94 : 1 }],
            }}
          >
            <Icon size={Math.round(size * 0.4)} color={ink} strokeWidth={2} aria-hidden />
          </View>
          <Text className="text-center text-body font-medium text-text-primary" numberOfLines={1}>
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}
