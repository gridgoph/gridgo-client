import { TriangleAlert } from "lucide-react-native";
import { Text, View } from "react-native";

import { useThemeColors } from "@/hooks/useTheme";
import type { ArtworkSizeNote as Note } from "@/lib/artworkSize";

/**
 * The file does not match the size chosen for it.
 *
 * Sits straight under the file, because that is what it is about, and states
 * both sizes as two rows so the client compares them rather than reading a
 * sentence about them. A warning in amber, never an error: checkout stays open.
 */
export function ArtworkSizeNote({ note }: { note: Note }) {
  const colors = useThemeColors();

  return (
    <View
      className="mt-3 flex-row items-start gap-3 rounded-field border border-warning bg-surface p-3"
      accessible
      accessibilityLabel={
        `This file does not match the print size. This product needs ${note.needs}. ` +
        `Your file is ${note.file}. ${note.message}`
      }
    >
      <View className="pt-0.5">
        <TriangleAlert size={16} color={colors.warning} strokeWidth={2} aria-hidden />
      </View>
      <View className="min-w-0 flex-1 gap-3">
        <Text className="text-body font-medium text-text-primary">
          This file does not match the print size
        </Text>
        <View className="gap-2">
          <Row label="THIS PRODUCT NEEDS" value={note.needs} />
          <Row label="YOUR FILE IS" value={note.file} />
        </View>
        <Text className="text-caption text-text-secondary">{note.message}</Text>
      </View>
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View className="gap-0.5">
      <Text className="text-overline text-text-muted">{label}</Text>
      <Text className="text-body text-text-primary">{value}</Text>
    </View>
  );
}
