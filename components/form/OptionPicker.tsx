import { Check, ChevronDown } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";

import { Sheet } from "@/components/Sheet";
import { useThemeColors } from "@/hooks/useTheme";

export type PickerOption = {
  /** The value stored on the order — a platform value, never typed prose. */
  value: string;
  label: string;
  /** Secondary line: what this option is for. */
  hint?: string | null;
};

export type CustomEntry = {
  /** Row label, e.g. "Enter a custom size". */
  label: string;
  /** Said before the client commits, not after. */
  hint: string;
  placeholder: string;
};

type Props = {
  /** Sheet title. The field label lives on the surrounding FormField. */
  title: string;
  value: string;
  options: PickerOption[];
  onChange: (value: string) => void;
  placeholder: string;
  /** Present when this field genuinely allows a value outside the list. */
  custom?: CustomEntry;
  /** Why the list is empty, when it is. */
  emptyReason?: string;
  disabled?: boolean;
  accessibilityLabel: string;
};

/**
 * Single-select over values the platform defines.
 *
 * Free text here is what makes two orders for the same 13oz tarpaulin
 * unmatchable, so the list is the control and a custom entry is a marked
 * exception rather than the default path.
 */
export function OptionPicker({
  title,
  value,
  options,
  onChange,
  placeholder,
  custom,
  emptyReason,
  disabled,
  accessibilityLabel,
}: Props) {
  const colors = useThemeColors();
  const [open, setOpen] = useState(false);

  const selected = options.find((option) => option.value === value);
  const isCustom = Boolean(value) && !selected;
  /**
   * A draft outlives a taxonomy edit. When the stored value is not on the list
   * and this field has no custom entry, it is a value the platform has since
   * dropped — say so rather than dressing it up as a deliberate choice.
   */
  const staleValue = isCustom && !custom && options.length > 0;

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityState={{ disabled: Boolean(disabled), expanded: open }}
        accessibilityValue={{ text: value || placeholder }}
        disabled={disabled}
        onPress={() => setOpen(true)}
        className={
          disabled
            ? "gg-field gg-disabled flex-row items-center justify-between"
            : "gg-field flex-row items-center justify-between"
        }
      >
        <Text
          className={
            value && !staleValue
              ? "flex-1 text-body text-text-primary"
              : staleValue
                ? "flex-1 text-body text-warning"
                : "flex-1 text-body text-text-muted"
          }
          numberOfLines={1}
        >
          {selected?.label ??
            (staleValue
              ? `${value} — no longer offered`
              : isCustom
                ? `${value} (custom)`
                : placeholder)}
        </Text>
        <ChevronDown size={18} color={colors.textMuted} strokeWidth={2} />
      </Pressable>

      <OptionSheet
        title={title}
        open={open}
        onClose={() => setOpen(false)}
        value={value}
        options={options}
        onChange={onChange}
        custom={custom}
        emptyReason={emptyReason}
      />
    </>
  );
}

function OptionSheet({
  title,
  open,
  onClose,
  value,
  options,
  onChange,
  custom,
  emptyReason,
}: {
  title: string;
  open: boolean;
  onClose: () => void;
  value: string;
  options: PickerOption[];
  onChange: (value: string) => void;
  custom?: CustomEntry;
  emptyReason?: string;
}) {
  const colors = useThemeColors();
  const isCustomValue = Boolean(value) && !options.some((option) => option.value === value);
  const [customMode, setCustomMode] = useState(false);
  const [customText, setCustomText] = useState(value);

  // Reopening the sheet starts from what is actually selected, not from
  // whatever the client typed and abandoned last time.
  useEffect(() => {
    if (open) {
      setCustomMode(isCustomValue);
      setCustomText(isCustomValue ? value : "");
    }
  }, [open, isCustomValue, value]);

  const commitCustom = () => {
    const trimmed = customText.trim();
    if (!trimmed) return;
    onChange(trimmed);
    onClose();
  };

  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <>
        {customMode && custom ? (
          <View className="gap-4 p-4">
            <Text className="text-body text-text-secondary">{custom.hint}</Text>
            <TextInput
              className="gg-field"
              value={customText}
              onChangeText={setCustomText}
              placeholder={custom.placeholder}
              placeholderTextColor={colors.textMuted}
              autoFocus
              accessibilityLabel={custom.label}
              onSubmitEditing={commitCustom}
              returnKeyType="done"
            />
            <View className="flex-row gap-3">
              <Pressable
                accessibilityRole="button"
                onPress={() => setCustomMode(false)}
                className="gg-btn-secondary flex-1"
              >
                <Text className="text-button text-text-primary">Back to list</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled: !customText.trim() }}
                disabled={!customText.trim()}
                onPress={commitCustom}
                className={
                  customText.trim() ? "gg-btn-primary flex-1" : "gg-btn-primary gg-disabled flex-1"
                }
              >
                <Text className="text-button text-action-yellow-on">Use this</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <ScrollView keyboardShouldPersistTaps="handled">
            {!options.length ? (
              <Text className="p-4 text-body text-text-secondary">
                {emptyReason ?? "Nothing to choose from yet."}
              </Text>
            ) : null}

            {options.map((option) => {
              const isSelected = option.value === value;
              return (
                <Pressable
                  key={option.value}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}
                  onPress={() => {
                    onChange(option.value);
                    onClose();
                  }}
                  className="min-h-14 flex-row items-center gap-3 border-b border-outline-subtle px-4 py-3"
                >
                  <View className="flex-1">
                    <Text className="text-body-lg text-text-primary">{option.label}</Text>
                    {option.hint ? (
                      <Text className="mt-0.5 text-caption text-text-muted">{option.hint}</Text>
                    ) : null}
                  </View>
                  {isSelected ? (
                    <Check size={18} color={colors.textPrimary} strokeWidth={2.5} />
                  ) : null}
                </Pressable>
              );
            })}

            {custom ? (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: isCustomValue }}
                onPress={() => {
                  setCustomText(isCustomValue ? value : "");
                  setCustomMode(true);
                }}
                className="min-h-14 flex-row items-center gap-3 px-4 py-3"
              >
                <View className="flex-1">
                  <Text className="text-body-lg text-text-primary">{custom.label}</Text>
                  <Text className="mt-0.5 text-caption text-text-muted">{custom.hint}</Text>
                </View>
                {isCustomValue ? (
                  <Check size={18} color={colors.textPrimary} strokeWidth={2.5} />
                ) : null}
              </Pressable>
            ) : null}
          </ScrollView>
        )}
      </>
    </Sheet>
  );
}
