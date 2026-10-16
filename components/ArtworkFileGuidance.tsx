import { CircleCheck, TriangleAlert, Upload } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";

import { CheckboxRow } from "@/components/form/CheckboxRow";
import { useThemeColors } from "@/hooks/useTheme";
import type { ArtworkGuidance, ArtworkGuidanceFile } from "@/lib/api";
import {
  REPRINT_NOTE,
  acceptedOn,
  fileFacts,
  isAccepted,
  warningCopy,
} from "@/lib/artworkGuidance";

type Props = {
  file: ArtworkGuidanceFile;
  guidance: Pick<ArtworkGuidance, "minimumDpi">;
  /** `fileId:code` of the warning being saved, if any on this item. */
  accepting: string | null;
  disabled: boolean;
  onAccept: (code: string, accept: boolean) => void;
  /** Absent where the item takes no uploads. */
  onReplace?: () => void;
};

/**
 * What GRIDGO read from one uploaded file at the size ordered — its colour
 * mode and the resolution it prints at — and any warning about either.
 *
 * A warning is never a block. Each one has the two ways on the issue asks
 * for: tick to print it as it is, or upload a better file in its place. The
 * tick is the client's own decision on the record, so it starts unticked and
 * says plainly what it gives up.
 */
export function ArtworkFileGuidance({ file, guidance, accepting, disabled, onAccept, onReplace }: Props) {
  const colors = useThemeColors();
  const facts = fileFacts(file, guidance);
  const warnings = file.warnings ?? [];
  if (!facts.length && !warnings.length) return null;

  return (
    <View className="gap-3">
      {facts.length ? (
        <View className="gap-1.5 rounded-field bg-surface-variant px-3 py-2.5">
          {facts.map((fact) => (
            <View key={fact.id} className="flex-row items-baseline gap-3">
              <Text className="w-20 text-caption text-text-muted">{fact.label}</Text>
              <Text className="min-w-0 flex-1 text-body text-text-primary">{fact.value}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {warnings.map((warning) => {
        const copy = warningCopy(warning);
        const accepted = isAccepted(warning);
        const saving = accepting === `${file.fileId}:${warning.code}`;
        return (
          <View
            key={warning.code}
            className={
              accepted
                ? "gap-2 rounded-field border border-outline px-3 pt-3 pb-1"
                : "gap-2 rounded-field border border-warning px-3 pt-3 pb-1"
            }
          >
            <View
              className="flex-row items-start gap-2"
              accessible
              accessibilityLabel={`${accepted ? "Accepted. " : "Warning. "}${copy.title}. ${copy.body}`}
            >
              <View className="pt-0.5">
                {accepted ? (
                  <CircleCheck size={16} color={colors.textSecondary} strokeWidth={2} aria-hidden />
                ) : (
                  <TriangleAlert size={16} color={colors.warning} strokeWidth={2} aria-hidden />
                )}
              </View>
              <View className="min-w-0 flex-1 gap-0.5">
                <Text className="text-body font-medium text-text-primary">{copy.title}</Text>
                <Text className="text-caption text-text-secondary">{copy.body}</Text>
              </View>
            </View>
            <CheckboxRow
              checked={accepted}
              disabled={disabled || saving}
              onChange={(next) => onAccept(warning.code, next)}
              label={copy.accept}
              hint={
                saving
                  ? "Saving…"
                  : accepted && warning.acceptedAt
                    ? `Accepted ${acceptedOn(warning.acceptedAt)}`
                    : undefined
              }
            />
          </View>
        );
      })}

      {warnings.length ? (
        <>
          {onReplace ? (
            <Pressable
              onPress={onReplace}
              disabled={disabled}
              accessibilityRole="button"
              accessibilityLabel="Upload a new file"
              accessibilityHint="The new file takes this one's place on the item"
              accessibilityState={{ disabled }}
              className={
                disabled
                  ? "gg-disabled min-h-11 flex-row items-center justify-center gap-2 rounded-field border border-outline bg-surface px-4"
                  : "min-h-11 flex-row items-center justify-center gap-2 rounded-field border border-outline bg-surface px-4"
              }
              style={({ pressed }) => (pressed && !disabled ? { opacity: 0.8 } : undefined)}
            >
              <Upload size={16} color={colors.textPrimary} strokeWidth={2.5} aria-hidden />
              <Text className="text-button text-text-primary">Upload a new file</Text>
            </Pressable>
          ) : null}
          <Text className="text-caption text-text-muted">{REPRINT_NOTE}</Text>
        </>
      ) : null}
    </View>
  );
}
