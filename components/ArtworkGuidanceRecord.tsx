import { CircleCheck, TriangleAlert } from "lucide-react-native";
import { Text, View } from "react-native";

import { useThemeColors } from "@/hooks/useTheme";
import { acceptanceLine, fileFacts, isAccepted, warningCopy, type OrderFileGuidance } from "@/lib/artworkGuidance";

/**
 * One file's artwork check as the order recorded it at checkout: its colour
 * mode, the resolution at the size ordered, and each warning with whether the
 * client accepted it. Read-only — the record cannot change after checkout,
 * and it is what the GRIDGO Team's quality check reads too.
 */
export function ArtworkGuidanceRecord({ record, name }: { record: OrderFileGuidance; name?: string }) {
  const colors = useThemeColors();
  const facts = fileFacts(record.file, { minimumDpi: record.minimumDpi });
  const warnings = record.file.warnings ?? [];
  if (!facts.length && !warnings.length) return null;
  return (
    <View className="gap-2">
      {name ? <Text className="text-caption text-text-muted">{name}</Text> : null}
      {facts.length ? (
        <Text className="text-caption text-text-secondary">
          {facts.map((fact) => `${fact.label}: ${fact.value}`).join(". ")}
        </Text>
      ) : null}
      {warnings.map((warning) => {
        const copy = warningCopy(warning);
        const accepted = isAccepted(warning);
        const status = acceptanceLine(warning);
        return (
          <View
            key={warning.code}
            className="flex-row items-start gap-2"
            accessible
            accessibilityLabel={`${copy.title}. ${status}.`}
          >
            <View className="pt-0.5">
              {accepted ? (
                <CircleCheck size={16} color={colors.textSecondary} strokeWidth={2} aria-hidden />
              ) : (
                <TriangleAlert size={16} color={colors.warning} strokeWidth={2} aria-hidden />
              )}
            </View>
            <View className="min-w-0 flex-1">
              <Text className="text-body text-text-primary">{copy.title}</Text>
              <Text className="text-caption text-text-muted">{status}</Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}
