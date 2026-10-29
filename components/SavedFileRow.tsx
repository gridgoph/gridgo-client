import { CircleAlert, ExternalLink, FileImage, FileText, Trash2 } from "lucide-react-native";
import { Linking, Pressable, Text, View } from "react-native";

import { CropMarkFrame } from "@/components/CropMarkFrame";
import { SamplePhoto } from "@/components/SamplePhoto";
import { useThemeColors } from "@/hooks/useTheme";
import type { SavedFile } from "@/lib/api";
import { formatStorage, savedDateLine, savedFileKind, savedFileType, unavailableLine } from "@/lib/myFiles";

type Props = {
  file: SavedFile;
  /** The way this file is used from here: on a new order, or on the item being made. */
  use: { label: string; onPress: () => void; refusal?: string | null };
  onDelete: () => void;
  /** Asks the screen for a fresh read once the signed picture has run out. */
  onStale: () => Promise<unknown> | void;
  /** Hide delete while choosing a file for an item. */
  deletable?: boolean;
  divided?: boolean;
};

/**
 * One saved file: what it looks like, what it is, and what can be done with it.
 *
 * The picture sits in the same crop marks as a shop's samples, because that is
 * what saved artwork is — a sheet waiting to be trimmed — and tapping it opens
 * the full picture. A file with no picture (a Word document, a PDF whose
 * thumbnail is not ready) gets its type instead, and "Open" hands the original
 * to the phone. Nothing here is yellow: a list of equals has no one action.
 */
export function SavedFileRow({ file, use, onDelete, onStale, deletable = true, divided = false }: Props) {
  const colors = useThemeColors();
  const type = savedFileType(file);
  const kind = savedFileKind(file);
  const unavailable = unavailableLine(file);
  const facts = [type, formatStorage(file.size)].join(" · ");
  const downloadUrl = file.downloadUrl;

  return (
    <View
      className={divided ? "gap-3 border-t border-outline-subtle px-4 py-4" : "gap-3 px-4 py-4"}
      accessibilityLabel={`${file.originalFilename}, ${facts}, ${savedDateLine(file.savedAt)}`}
    >
      <View className="flex-row items-start gap-3">
        <View className="w-20">
          {file.previewUrl ? (
            <SamplePhoto
              url={file.previewUrl}
              expiresAt={file.expiresAt}
              onStale={onStale}
              altText={`Preview of ${file.originalFilename}`}
              gutter="tight"
            />
          ) : (
            <TypeTile image={file.detectedContentType.startsWith("image/")} />
          )}
        </View>
        <View className="min-w-0 flex-1 gap-0.5 pt-1">
          <Text className="text-body-lg text-text-primary" numberOfLines={2}>
            {file.originalFilename}
          </Text>
          <Text className="text-caption text-text-muted">{facts}</Text>
          <Text className="text-caption text-text-muted">
            {kind ? `${kind} · ${savedDateLine(file.savedAt)}` : savedDateLine(file.savedAt)}
          </Text>
        </View>
      </View>

      {unavailable ? (
        <View className="flex-row items-start gap-2">
          <View className="pt-0.5">
            <CircleAlert size={16} color={colors.warning} strokeWidth={2} aria-hidden />
          </View>
          <Text className="min-w-0 flex-1 text-body text-text-secondary">{unavailable}</Text>
        </View>
      ) : null}

      <View className="flex-row flex-wrap items-center gap-2">
        <Pressable
          onPress={use.onPress}
          disabled={Boolean(use.refusal)}
          accessibilityRole="button"
          accessibilityLabel={`${use.label}: ${file.originalFilename}`}
          accessibilityHint={use.refusal ?? undefined}
          accessibilityState={{ disabled: Boolean(use.refusal) }}
          className={use.refusal ? "gg-btn-secondary gg-disabled px-4" : "gg-btn-secondary px-4"}
          style={({ pressed }) => (pressed && !use.refusal ? { opacity: 0.7 } : undefined)}
        >
          <Text className="text-button text-text-primary">{use.label}</Text>
        </Pressable>
        {downloadUrl ? (
          <QuietButton
            icon={ExternalLink}
            label="Open"
            accessibilityLabel={`Open ${file.originalFilename}`}
            onPress={() => void Linking.openURL(downloadUrl).catch(() => undefined)}
          />
        ) : null}
        {deletable ? (
          <QuietButton
            icon={Trash2}
            label="Delete"
            accessibilityLabel={`Delete ${file.originalFilename}`}
            tone="error"
            onPress={onDelete}
          />
        ) : null}
      </View>
      {use.refusal ? <Text className="text-caption text-text-secondary">{use.refusal}</Text> : null}
    </View>
  );
}

/** A file with no picture: its kind, on the same trimmed sheet. */
function TypeTile({ image }: { image: boolean }) {
  const colors = useThemeColors();
  const Icon = image ? FileImage : FileText;
  return (
    <CropMarkFrame gutter="tight">
      <View className="w-full items-center justify-center" style={{ aspectRatio: 1 }} aria-hidden>
        <Icon size={24} color={colors.textSecondary} strokeWidth={1.75} />
      </View>
    </CropMarkFrame>
  );
}

function QuietButton({
  icon: Icon,
  label,
  accessibilityLabel,
  tone,
  onPress,
}: {
  icon: typeof Trash2;
  label: string;
  accessibilityLabel: string;
  tone?: "error";
  onPress: () => void;
}) {
  const colors = useThemeColors();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      className="min-h-11 flex-row items-center gap-2 px-3"
      style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
    >
      <Icon size={16} color={tone === "error" ? colors.error : colors.textSecondary} strokeWidth={2} aria-hidden />
      <Text className={tone === "error" ? "text-body font-medium text-error" : "text-body font-medium text-text-primary"}>
        {label}
      </Text>
    </Pressable>
  );
}
