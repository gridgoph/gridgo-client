import { Check } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";

import { useThemeColors } from "@/hooks/useTheme";
import { formatPhp, type CatalogOption, type CatalogOptionGroup } from "@/lib/api";

type Props = {
  group: CatalogOptionGroup;
  /** Step number for a required spec group; null for an add-on. */
  step: number | null;
  selectedId: string | undefined;
  onSelect: (optionId: string | null) => void;
};

/**
 * One group of the shop's order sheet, with the boxes tickable.
 *
 * The supplier app draws this same sheet empty, as a preview, with a circle
 * where a client must answer and a square where they may skip. Those shapes are
 * kept here and filled in, so a shop that checked its own listing recognises
 * exactly what its client is looking at.
 *
 * Money sits in one right-aligned column. A step that costs nothing extra says
 * "Included" rather than "+₱0.00": the client is choosing a spec, not reading a
 * price list, and a column of zeroes buries the two rows that do cost more.
 *
 * Every group is single-select, which is what the platform supports. An add-on
 * can be unticked by tapping it again, because "no lamination" is a real answer
 * and there is nowhere else to give it.
 */
export function OptionGroupPicker({ group, step, selectedId, onSelect }: Props) {
  const heading =
    step != null ? `STEP ${step} · ${group.name.toUpperCase()}` : group.name.toUpperCase();

  return (
    <View className="gap-3">
      <View className="flex-row items-center justify-between gap-3">
        <Text className="min-w-0 flex-1 text-overline text-text-muted">{heading}</Text>
        <View className="rounded-pill border border-outline px-2 py-0.5">
          <Text className="text-caption text-text-secondary">
            {group.required ? "Pick 1" : "Optional"}
          </Text>
        </View>
      </View>

      {group.helpText ? (
        <Text className="text-caption text-text-muted">{group.helpText}</Text>
      ) : null}

      <View className="gg-card-flush">
        {group.options.map((option, index) => (
          <OptionRow
            key={option.id}
            option={option}
            required={group.required}
            groupName={group.name}
            selected={option.id === selectedId}
            first={index === 0}
            onPress={() =>
              onSelect(option.id === selectedId && !group.required ? null : option.id)
            }
          />
        ))}
      </View>
    </View>
  );
}

function OptionRow({
  option,
  required,
  groupName,
  selected,
  first,
  onPress,
}: {
  option: CatalogOption;
  required: boolean;
  groupName: string;
  selected: boolean;
  first: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole={required ? "radio" : "checkbox"}
      accessibilityState={{ checked: selected }}
      accessibilityLabel={`${option.label}, ${groupName}`}
      accessibilityHint={modifierSpoken(option.priceModifierMinor)}
      className={
        first
          ? "gg-touch flex-row items-center gap-3 px-4 py-3"
          : "gg-touch flex-row items-center gap-3 border-t border-outline-subtle px-4 py-3"
      }
    >
      {({ pressed }) => (
        <>
          <Marker required={required} selected={selected} />
          <Text className="min-w-0 flex-1 text-body text-text-primary">{option.label}</Text>
          <Text
            className={
              option.priceModifierMinor > 0
                ? "text-body text-text-primary"
                : "text-caption text-text-muted"
            }
          >
            {modifierLine(option.priceModifierMinor)}
          </Text>
          {pressed ? (
            <View pointerEvents="none" className="gg-pressed absolute inset-0" />
          ) : null}
        </>
      )}
    </Pressable>
  );
}

/**
 * The control beside a choice.
 *
 * A circle where the client must answer and a square where they may skip — the
 * two shapes every order sheet on a phone already uses. Selection is a filled
 * accent mark, never colour on its own: this reads correctly in grayscale, and
 * the row also carries its own accessibility state.
 */
function Marker({ required, selected }: { required: boolean; selected: boolean }) {
  const colors = useThemeColors();
  const shape = required ? "rounded-pill" : "rounded-sm";

  if (!selected) {
    return (
      <View
        className={`h-[18px] w-[18px] border border-outline ${shape}`}
        accessibilityElementsHidden
        importantForAccessibility="no"
      />
    );
  }

  return (
    <View
      className={`h-[18px] w-[18px] items-center justify-center border border-accent bg-accent ${shape}`}
      accessibilityElementsHidden
      importantForAccessibility="no"
    >
      <Check size={12} color={colors.accentOn} strokeWidth={3} />
    </View>
  );
}

/** "+₱12.00" or "Included". Never "+₱0.00". */
export function modifierLine(priceModifierMinor: number): string {
  if (priceModifierMinor === 0) return "Included";
  const sign = priceModifierMinor > 0 ? "+" : "−";
  return `${sign}${formatPhp(Math.abs(priceModifierMinor))}`;
}

function modifierSpoken(priceModifierMinor: number): string {
  if (priceModifierMinor === 0) return "No extra charge";
  return priceModifierMinor > 0
    ? `Adds ${formatPhp(priceModifierMinor)}`
    : `Takes off ${formatPhp(Math.abs(priceModifierMinor))}`;
}
