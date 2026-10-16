import { CircleCheck, Pencil, Trash2 } from "lucide-react-native";
import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";

import { ColorChip } from "@/components/ColorChip";
import { useThemeColors } from "@/hooks/useTheme";
import { swatchNote, targetFoundIn, type ArtworkColorsEntry, type ColorTarget } from "@/lib/colorTargets";

type Props = {
  targets: ColorTarget[];
  /** The files' read colours, to say which file states a colour exactly. */
  artworkColors?: ArtworkColorsEntry[];
  /** A file's name for the "In front.pdf" line. */
  fileName?: (fileId: string) => string;
  onEdit?: (index: number) => void;
  onRemove?: (index: number) => void;
  disabled?: boolean;
};

/**
 * The exact colours on an item: chip, label, the value as GRIDGO stored it,
 * and what the swatch may claim. Read-only on the order and the proof; the
 * artwork step adds Change and Remove.
 */
export function ColorTargetList({ targets, artworkColors = [], fileName, onEdit, onRemove, disabled = false }: Props) {
  const colors = useThemeColors();
  return (
    <View>
      {targets.map((target, index) => {
        const found = fileName ? targetFoundIn(target, artworkColors) : [];
        const note = swatchNote(target);
        const foundLine = found.length ? `In ${found.map((fileId) => fileName?.(fileId) ?? "your file").join(", ")}` : null;
        return (
          <View
            key={`${index}:${target.label}:${target.value}`}
            className={index === 0 ? "flex-row items-center gap-3 py-3" : "flex-row items-center gap-3 border-t border-outline-subtle py-3"}
          >
            <View
              className="min-w-0 flex-1 flex-row items-center gap-3"
              accessible
              accessibilityLabel={[target.label, target.value, note, foundLine].filter(Boolean).join(". ")}
            >
              <ColorChip target={target} />
              <View className="min-w-0 flex-1 gap-0.5">
                <Text className="text-body font-medium text-text-primary">{target.label}</Text>
                <Text className="text-body text-text-primary" selectable>
                  {target.value}
                </Text>
                <Text className="text-caption text-text-muted">{note}</Text>
                {foundLine ? (
                  <View className="flex-row items-center gap-1.5">
                    <CircleCheck size={14} color={colors.success} strokeWidth={2} aria-hidden />
                    <Text className="min-w-0 flex-1 text-caption text-text-secondary" numberOfLines={2}>
                      {foundLine}
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>
            {onEdit ? (
              <RowAction label={`Change ${target.label}`} disabled={disabled} onPress={() => onEdit(index)}>
                <Pencil size={18} color={colors.textSecondary} strokeWidth={2} aria-hidden />
              </RowAction>
            ) : null}
            {onRemove ? (
              <RowAction label={`Remove ${target.label}`} disabled={disabled} onPress={() => onRemove(index)}>
                <Trash2 size={18} color={colors.textSecondary} strokeWidth={2} aria-hidden />
              </RowAction>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

function RowAction({
  label,
  disabled,
  onPress,
  children,
}: {
  label: string;
  disabled: boolean;
  onPress: () => void;
  children: ReactNode;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      className={disabled ? "h-11 w-11 items-center justify-center rounded-pill gg-disabled" : "h-11 w-11 items-center justify-center rounded-pill"}
    >
      {({ pressed }) => (
        <>
          {children}
          {pressed && !disabled ? <View pointerEvents="none" className="gg-pressed absolute inset-0 rounded-pill" /> : null}
        </>
      )}
    </Pressable>
  );
}
