import { FileQuestion } from "lucide-react-native";
import { Text, View } from "react-native";

import { ColorDot } from "@/components/ColorChip";
import { useThemeColors } from "@/hooks/useTheme";
import {
  artworkColorDetail,
  artworkColorLabel,
  artworkColorsView,
  type ArtworkColorsEntry,
} from "@/lib/colorTargets";

/** Enough to compare against a handful of brand colours without a wall of chips. */
const SHOWN = 8;

/**
 * The colours GRIDGO read from each uploaded file, beside the client's
 * targets. Spot colours by name, the rest by their own values; a file whose
 * colours could not be read says so in a sentence rather than showing an
 * empty palette, and a partly read file says what was left out.
 */
export function ArtworkColorsList({
  entries,
  fileName,
}: {
  entries: ArtworkColorsEntry[];
  fileName: (fileId: string) => string;
}) {
  const colors = useThemeColors();
  if (!entries.length) return null;
  return (
    <View className="gap-4">
      {entries.map((entry) => {
        const view = artworkColorsView(entry.colors);
        const name = fileName(entry.fileId);
        return (
          <View key={entry.fileId} className="gap-2">
            <Text className="text-body font-medium text-text-primary" numberOfLines={1}>
              {name}
            </Text>
            {view.kind === "unknown" ? (
              <View className="flex-row items-start gap-2" accessible accessibilityLabel={[view.headline, ...view.notes].join(". ")}>
                <View className="pt-0.5">
                  <FileQuestion size={16} color={colors.textMuted} strokeWidth={2} aria-hidden />
                </View>
                <View className="min-w-0 flex-1 gap-0.5">
                  <Text className="text-body text-text-secondary">{view.headline}.</Text>
                  {view.notes.map((note) => (
                    <Text key={note} className="text-caption text-text-muted">
                      {note}
                    </Text>
                  ))}
                </View>
              </View>
            ) : (
              <>
                <View className="flex-row flex-wrap gap-2">
                  {view.colors.slice(0, SHOWN).map((color, index) => {
                    const label = artworkColorLabel(color);
                    const detail = artworkColorDetail(color);
                    return (
                      <View
                        key={`${index}:${label}`}
                        className="flex-row items-center gap-2 rounded-pill border border-outline bg-surface py-1 pl-1.5 pr-3"
                        accessible
                        accessibilityLabel={`${label}, ${detail}`}
                      >
                        <ColorDot hex={color.hex} size={20} />
                        <View>
                          <Text className="text-caption font-medium text-text-primary">{label}</Text>
                          <Text className="text-caption text-text-muted">{detail}</Text>
                        </View>
                      </View>
                    );
                  })}
                </View>
                {view.colors.length > SHOWN ? (
                  <Text className="text-caption text-text-muted">
                    And {view.colors.length - SHOWN} more in this file.
                  </Text>
                ) : null}
                {view.notes.map((note) => (
                  <Text key={note} className="text-caption text-text-muted">
                    {note}
                  </Text>
                ))}
              </>
            )}
          </View>
        );
      })}
    </View>
  );
}
