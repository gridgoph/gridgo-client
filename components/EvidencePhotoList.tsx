import { Trash2 } from "lucide-react-native";
import { ActivityIndicator, Image, Pressable, Text, View } from "react-native";

import { SecondaryButton } from "@/components/SecondaryButton";
import { useThemeColors } from "@/hooks/useTheme";
import type { ImageUpload } from "@/lib/imageUpload";

type Props = {
  photos: readonly ImageUpload[];
  max: number;
  disabled?: boolean;
  onAdd: () => void;
  onRemove: (key: string) => void;
};

/**
 * Photos on their way to GRIDGO, one row each: a thumbnail, where the upload
 * stands in words, and a remove control. "Uploaded" only once the server has
 * the file; a failed one says why and can be removed.
 */
export function EvidencePhotoList({ photos, max, disabled, onAdd, onRemove }: Props) {
  const colors = useThemeColors();
  return (
    <View className="gap-2">
      {photos.map((slot, index) => (
        <View key={slot.key} className="gg-card flex-row items-center gap-3 p-3">
          {slot.localUri ? (
            <Image
              source={{ uri: slot.localUri }}
              accessibilityLabel={`Photo ${index + 1}`}
              resizeMode="cover"
              style={{ width: 48, height: 48, borderRadius: 8 }}
            />
          ) : null}
          <View className="min-w-0 flex-1">
            <Text numberOfLines={1} className="text-body text-text-primary">{slot.fileName || `Photo ${index + 1}`}</Text>
            <Text className={slot.phase === "failed" ? "text-caption text-error" : "text-caption text-text-muted"}>
              {slot.phase === "failed"
                ? slot.error
                : slot.phase === "sending"
                  ? slot.progress == null ? "Sending…" : `Sending — ${Math.round(slot.progress * 100)}%`
                  : "Uploaded"}
            </Text>
          </View>
          {slot.phase === "sending" ? <ActivityIndicator size="small" color={colors.textMuted} /> : null}
          <Pressable
            onPress={() => onRemove(slot.key)}
            accessibilityRole="button"
            accessibilityLabel={`Remove photo ${index + 1}`}
            className="gg-touch items-center justify-center"
          >
            <Trash2 size={18} color={colors.textSecondary} strokeWidth={2} />
          </Pressable>
        </View>
      ))}
      {photos.length < max ? <SecondaryButton label="Add a photo" disabled={disabled} onPress={onAdd} /> : null}
    </View>
  );
}
