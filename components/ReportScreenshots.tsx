import { ImagePlus, X } from "lucide-react-native";
import { Image, Pressable, Text, View } from "react-native";

import { useThemeColors } from "@/hooks/useTheme";
import type { UploadAsset } from "@/lib/api";

const THUMB = 88;

type Props = {
  screenshots: UploadAsset[];
  max: number;
  disabled?: boolean;
  onAdd: () => void;
  onRemove: (index: number) => void;
};

/**
 * The screenshots going with a bug report: a thumbnail for each with its own
 * remove control, and the add control while there is room for another. The
 * field's helper already says how many fit, so a full set just drops the add.
 */
export function ReportScreenshots({ screenshots, max, disabled, onAdd, onRemove }: Props) {
  const colors = useThemeColors();
  const full = screenshots.length >= max;

  return (
    <View className="gap-3">
      {screenshots.length ? (
        <View className="flex-row flex-wrap gap-3">
          {screenshots.map((shot, index) => (
            <View
              key={`${shot.uri}-${index}`}
              className="overflow-hidden rounded-field border border-outline bg-surface-variant"
              style={{ width: THUMB, height: THUMB }}
            >
              <Image
                source={{ uri: shot.uri }}
                resizeMode="cover"
                accessibilityLabel={`Screenshot ${index + 1}`}
                style={{ width: "100%", height: "100%" }}
              />
              <Pressable
                onPress={() => onRemove(index)}
                disabled={disabled}
                accessibilityRole="button"
                accessibilityLabel={`Remove screenshot ${index + 1}`}
                accessibilityState={{ disabled: Boolean(disabled) }}
                hitSlop={4}
                className="absolute right-0 top-0 h-11 w-11 items-end justify-start p-1"
              >
                <View className="h-7 w-7 items-center justify-center rounded-pill bg-accent">
                  <X size={16} color={colors.accentOn} strokeWidth={2.5} aria-hidden />
                </View>
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}

      {full ? null : (
        <Pressable
          onPress={onAdd}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel="Add screenshot"
          accessibilityState={{ disabled: Boolean(disabled) }}
          className={disabled ? "gg-btn-secondary gg-disabled" : "gg-btn-secondary"}
        >
          {({ pressed }) => (
            <>
              <View className="flex-row items-center gap-2">
                <ImagePlus size={18} color={colors.textPrimary} strokeWidth={2} aria-hidden />
                <Text className="text-button text-text-primary">Add screenshot</Text>
              </View>
              {pressed ? (
                <View pointerEvents="none" className="gg-pressed absolute inset-0 rounded-field" />
              ) : null}
            </>
          )}
        </Pressable>
      )}
    </View>
  );
}
