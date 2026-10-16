import { Info } from "lucide-react-native";
import { useEffect } from "react";
import { Text, View } from "react-native";

import { ArtworkColorsList } from "@/components/ArtworkColorsList";
import { ColorTargetList } from "@/components/ColorTargetList";
import { useThemeColors } from "@/hooks/useTheme";
import type { ProductionItem } from "@/lib/api";
import { lineAttachments } from "@/lib/artworkAttachments";
import { SCREEN_PRINT_NOTE, colorFileNamer, colorTargetsOf } from "@/lib/colorTargets";
import { useArtworkAttachments } from "@/store/artworkAttachments";

/**
 * The exact colours agreed at checkout, per item, as the order and the
 * artwork proof show them. With `withFiles`, the colours GRIDGO read from
 * each file sit under the targets so the two can be compared. Draws nothing
 * for an order whose items named no colours.
 */
export function ExactColoursRecord({
  items,
  withFiles = false,
  bare = false,
}: {
  items: ProductionItem[];
  withFiles?: boolean;
  /** Straight onto the surface it sits in, without a card of its own. */
  bare?: boolean;
}) {
  const colors = useThemeColors();
  const named = items.filter((item) => colorTargetsOf(item).length);
  // The names the files were uploaded with, read once and shared with the artwork step.
  const files = useArtworkAttachments((state) => state.files);
  const fileIds = named.flatMap((item) => (item.artworkColors ?? []).map((entry) => entry.fileId));
  useEffect(() => {
    for (const fileId of fileIds) void useArtworkAttachments.getState().readFile(fileId);
  }, [fileIds.join(" ")]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!named.length) return null;
  const several = items.length > 1;
  return (
    <View className={bare ? "gap-1 border-b border-outline-subtle py-3" : "gg-card gap-3"}>
      <Text className={bare ? "text-body text-text-secondary" : "text-h3 text-text-primary"}>Exact colours</Text>
      {named.map((item) => {
        const fileName = colorFileNamer(lineAttachments(item), (fileId) => files[fileId]?.originalFilename);
        const read = item.artworkColors ?? [];
        const shown = withFiles ? read : [];
        return (
          <View key={item.id} className="gap-2">
            {several ? <Text className="text-caption text-text-muted">{item.itemName}</Text> : null}
            <ColorTargetList targets={colorTargetsOf(item)} artworkColors={read} fileName={fileName} />
            {shown.length ? (
              <View className="gap-2 pt-1">
                <Text className="text-overline text-text-muted">COLOURS IN YOUR FILES</Text>
                <ArtworkColorsList entries={shown} fileName={fileName} />
              </View>
            ) : null}
          </View>
        );
      })}
      <View className={bare ? "flex-row items-start gap-2 pt-2" : "flex-row items-start gap-2"} accessible accessibilityLabel={SCREEN_PRINT_NOTE}>
        <View className="pt-0.5">
          <Info size={14} color={colors.info} strokeWidth={2} aria-hidden />
        </View>
        <Text className="min-w-0 flex-1 text-caption text-text-secondary">{SCREEN_PRINT_NOTE}</Text>
      </View>
    </View>
  );
}
