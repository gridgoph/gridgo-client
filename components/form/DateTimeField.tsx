import { CalendarClock } from "lucide-react-native";
import { useState } from "react";
import { Platform, Pressable, Text, View } from "react-native";

import { Sheet } from "@/components/Sheet";
import { useThemeColors, useThemeName } from "@/hooks/useTheme";
import { formatDeadline } from "@/lib/deadline";
import { DEADLINE_PICKER_NEEDS_REBUILD, getDateTimePickerNative } from "@/lib/nativeModules";

type Props = {
  /** ISO instant, or empty when nothing is chosen yet. */
  value: string;
  onChange: (isoValue: string) => void;
  /** Where the picker opens when nothing is chosen. */
  suggested: Date;
  minimumDate: Date;
  maximumDate: Date;
  placeholder: string;
  accessibilityLabel: string;
};

/**
 * A real date and time picker.
 *
 * A text box asking for "15 Aug 2026, 10:00" cannot be validated, cannot be
 * localised, and cannot stop a client choosing yesterday. This uses the
 * platform control: an inline calendar sheet on iOS, and the native date then
 * time dialogs on Android, which is the only combination Android offers.
 */
export function DateTimeField({
  value,
  onChange,
  suggested,
  minimumDate,
  maximumDate,
  placeholder,
  accessibilityLabel,
}: Props) {
  const colors = useThemeColors();
  const themeName = useThemeName();
  const [iosOpen, setIosOpen] = useState(false);
  const [iosDraft, setIosDraft] = useState<Date>(suggested);
  const [rebuildHint, setRebuildHint] = useState(false);
  const picker = getDateTimePickerNative();
  const DateTimePicker = picker?.default;
  const DateTimePickerAndroid = picker?.DateTimePickerAndroid;

  const current = value ? new Date(value) : null;
  const startFrom = current && Number.isFinite(current.getTime()) ? current : suggested;

  const clamp = (date: Date): Date => {
    if (date.getTime() < minimumDate.getTime()) return minimumDate;
    if (date.getTime() > maximumDate.getTime()) return maximumDate;
    return date;
  };

  const openAndroid = () => {
    if (!DateTimePickerAndroid) {
      setRebuildHint(true);
      return;
    }
    DateTimePickerAndroid.open({
      value: startFrom,
      mode: "date",
      minimumDate,
      maximumDate,
      onChange: (event, picked?: Date) => {
        if (event.type !== "set" || !picked) return;
        DateTimePickerAndroid.open({
          value: picked,
          mode: "time",
          is24Hour: false,
          onChange: (timeEvent, time?: Date) => {
            if (timeEvent.type !== "set" || !time) return;
            const combined = new Date(picked);
            combined.setHours(time.getHours(), time.getMinutes(), 0, 0);
            onChange(clamp(combined).toISOString());
          },
        });
      },
    });
  };

  const open = () => {
    if (!picker) {
      setRebuildHint(true);
      return;
    }
    if (Platform.OS === "android") {
      openAndroid();
      return;
    }
    setIosDraft(startFrom);
    setIosOpen(true);
  };

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityValue={{ text: value ? formatDeadline(value) : placeholder }}
        onPress={open}
        className="gg-field flex-row items-center justify-between px-6"
      >
        <Text
          className={value ? "flex-1 text-body text-text-primary" : "flex-1 text-body text-text-muted"}
          numberOfLines={1}
        >
          {value ? formatDeadline(value) : placeholder}
        </Text>
        <CalendarClock size={18} color={colors.textMuted} strokeWidth={2} />
      </Pressable>
      {rebuildHint ? (
        <Text className="text-caption text-text-secondary">{DEADLINE_PICKER_NEEDS_REBUILD}</Text>
      ) : null}

      {Platform.OS !== "android" && DateTimePicker ? (
        <Sheet
          open={iosOpen}
          onClose={() => setIosOpen(false)}
          title="Deadline"
          subtitle="When the finished job has to be in your hands."
        >
          <View className="gap-4 px-2 pt-2">
            <DateTimePicker
              value={iosDraft}
              mode="datetime"
              display="inline"
              minimumDate={minimumDate}
              maximumDate={maximumDate}
              themeVariant={themeName}
              accentColor={colors.textPrimary}
              onChange={(_event, picked?: Date) => {
                if (picked) setIosDraft(picked);
              }}
            />
            <View className="flex-row gap-3 px-2">
              <Pressable
                accessibilityRole="button"
                onPress={() => setIosOpen(false)}
                className="gg-btn-secondary flex-1"
              >
                <Text className="text-button text-text-primary">Cancel</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  onChange(clamp(iosDraft).toISOString());
                  setIosOpen(false);
                }}
                className="gg-btn-primary flex-1"
              >
                <Text className="text-button text-action-yellow-on">Set deadline</Text>
              </Pressable>
            </View>
          </View>
        </Sheet>
      ) : null}
    </>
  );
}
