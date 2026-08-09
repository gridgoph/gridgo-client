import DateTimePicker, {
  DateTimePickerAndroid,
  type DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import { CalendarClock } from "lucide-react-native";
import { useState } from "react";
import { Modal, Platform, Pressable, Text, View } from "react-native";

import { useThemeColors, useThemeName } from "@/hooks/useTheme";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { formatDeadline } from "@/lib/deadline";

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
  const reducedMotion = useReducedMotion();
  const [iosOpen, setIosOpen] = useState(false);
  const [iosDraft, setIosDraft] = useState<Date>(suggested);

  const current = value ? new Date(value) : null;
  const startFrom = current && Number.isFinite(current.getTime()) ? current : suggested;

  const clamp = (date: Date): Date => {
    if (date.getTime() < minimumDate.getTime()) return minimumDate;
    if (date.getTime() > maximumDate.getTime()) return maximumDate;
    return date;
  };

  const openAndroid = () => {
    DateTimePickerAndroid.open({
      value: startFrom,
      mode: "date",
      minimumDate,
      maximumDate,
      onChange: (event: DateTimePickerEvent, picked?: Date) => {
        if (event.type !== "set" || !picked) return;
        DateTimePickerAndroid.open({
          value: picked,
          mode: "time",
          is24Hour: false,
          onChange: (timeEvent: DateTimePickerEvent, time?: Date) => {
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
        className="gg-field flex-row items-center justify-between"
      >
        <Text
          className={value ? "flex-1 text-body text-text-primary" : "flex-1 text-body text-text-muted"}
          numberOfLines={1}
        >
          {value ? formatDeadline(value) : placeholder}
        </Text>
        <CalendarClock size={18} color={colors.textMuted} strokeWidth={2} />
      </Pressable>

      {Platform.OS !== "android" ? (
        <Modal
          visible={iosOpen}
          transparent
          animationType={reducedMotion ? "none" : "slide"}
          onRequestClose={() => setIosOpen(false)}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close"
            onPress={() => setIosOpen(false)}
            className="flex-1 bg-scrim"
          />
          <View className="rounded-t-card border-t border-outline bg-surface pb-8">
            <View className="border-b border-outline-subtle px-4 py-3">
              <Text className="text-h3 text-text-primary">Deadline</Text>
              <Text className="mt-1 text-caption text-text-muted">
                When the finished job has to be in your hands.
              </Text>
            </View>
            <View className="px-2 py-2">
              <DateTimePicker
                value={iosDraft}
                mode="datetime"
                display="inline"
                minimumDate={minimumDate}
                maximumDate={maximumDate}
                themeVariant={themeName}
                accentColor={colors.textPrimary}
                onChange={(_event: DateTimePickerEvent, picked?: Date) => {
                  if (picked) setIosDraft(picked);
                }}
              />
            </View>
            <View className="flex-row gap-3 px-4">
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
        </Modal>
      ) : null}
    </>
  );
}
