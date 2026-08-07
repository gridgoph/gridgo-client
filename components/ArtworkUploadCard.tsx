import { Text, TextInput, View } from "react-native";

import { StatusChip } from "@/components/StatusChip";
import { useThemeColors } from "@/hooks/useTheme";
import { buildPreflightChecklist } from "@/lib/requestValidation";

type Props = {
  artworkName: string;
  onChangeName: (name: string) => void;
  /** When true, field is read-only (review/confirm). */
  readOnly?: boolean;
};

/**
 * Demo artwork affordance.
 *
 * The API stores a filename only (`artworkName`). Copy is honest: no bytes
 * are uploaded in this pilot build.
 */
export function ArtworkUploadCard({ artworkName, onChangeName, readOnly }: Props) {
  const colors = useThemeColors();
  const checklist = buildPreflightChecklist(artworkName);

  return (
    <View className="gap-4">
      <View className="gg-card gap-3">
        <Text className="text-h3 text-text-primary">Artwork</Text>
        <Text className="text-body text-text-secondary">
          This demo stores the file name only. No file bytes are uploaded to the
          server — enter the name you will hand off offline or in a later release.
        </Text>
        {readOnly ? (
          <View className="gg-panel">
            <Text className="text-caption text-text-muted">File name</Text>
            <Text className="mt-1 text-body-lg text-text-primary">
              {artworkName.trim() || "—"}
            </Text>
          </View>
        ) : (
          <TextInput
            className="gg-field"
            value={artworkName}
            onChangeText={onChangeName}
            placeholder="e.g. opening-banner-final.pdf"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            accessibilityLabel="Artwork file name"
          />
        )}
      </View>

      <View className="gg-card gap-3">
        <Text className="text-body-lg font-medium text-text-primary">Preflight checklist</Text>
        <Text className="text-caption text-text-muted">
          Demo presentation only — real preflight will run when file upload lands.
        </Text>
        {checklist.map((item) => (
          <View key={item.id} className="flex-row items-center justify-between gap-3 py-1">
            <Text className="flex-1 text-body text-text-secondary">{item.label}</Text>
            <StatusChip
              tone={
                item.status === "pass" ? "success" : item.status === "fail" ? "error" : "warning"
              }
              label={
                item.status === "pass" ? "Pass" : item.status === "fail" ? "Missing" : "Pending"
              }
              icon={
                item.status === "pass"
                  ? "circle-check"
                  : item.status === "fail"
                    ? "circle-x"
                    : "clock"
              }
            />
          </View>
        ))}
      </View>
    </View>
  );
}
