import { Check } from "lucide-react-native";
import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";

import { useThemeColors } from "@/hooks/useTheme";

export type Choice<T extends string> = {
  value: T;
  label: string;
  note?: string | null;
  /** Drawn at the row's end: a price, say. */
  trailing?: ReactNode;
  /** Spoken after the label; the trailing node is not read. */
  trailingLabel?: string | null;
  disabled?: boolean;
};

/**
 * One choice from a short list, in the grouped-row look of the layout
 * choice on the listing sheet: ink check marker, never yellow, because it is
 * a control and not the screen's action.
 */
export function ChoiceList<T extends string>({
  label,
  choices,
  selected,
  onSelect,
  disabled = false,
}: {
  /** The group's accessibility label. */
  label: string;
  choices: Choice<T>[];
  selected: T | null;
  onSelect: (value: T) => void;
  disabled?: boolean;
}) {
  return (
    <View className="gg-card-flush" accessibilityRole="radiogroup" accessibilityLabel={label}>
      {choices.map((choice, index) => {
        const chosen = choice.value === selected;
        const off = disabled || Boolean(choice.disabled);
        return (
          <View key={choice.value} className={index === 0 ? undefined : "border-t border-outline-subtle"}>
            <Pressable
              onPress={() => onSelect(choice.value)}
              disabled={off}
              accessibilityRole="radio"
              accessibilityState={{ checked: chosen, disabled: off }}
              accessibilityLabel={[choice.label, choice.trailingLabel, choice.note].filter(Boolean).join(". ")}
              className={off && !chosen ? "gg-touch gg-disabled flex-row items-center gap-3 px-4 py-3" : "gg-touch flex-row items-center gap-3 px-4 py-3"}
            >
              {({ pressed }) => (
                <>
                  <Marker selected={chosen} />
                  <View className="min-w-0 flex-1 gap-0.5">
                    <Text className="text-body text-text-primary">{choice.label}</Text>
                    {choice.note ? <Text className="text-caption text-text-muted">{choice.note}</Text> : null}
                  </View>
                  {choice.trailing}
                  {pressed && !off ? <View pointerEvents="none" className="gg-pressed absolute inset-0" /> : null}
                </>
              )}
            </Pressable>
          </View>
        );
      })}
    </View>
  );
}

function Marker({ selected }: { selected: boolean }) {
  const colors = useThemeColors();
  if (!selected) {
    return <View className="h-[18px] w-[18px] rounded-pill border border-outline" aria-hidden />;
  }
  return (
    <View className="h-[18px] w-[18px] items-center justify-center rounded-pill border border-accent bg-accent" aria-hidden>
      <Check size={12} color={colors.accentOn} strokeWidth={3} />
    </View>
  );
}
