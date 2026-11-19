import { useRouter } from "expo-router";
import { CircleAlert, CircleCheck, FileText, FolderOpen, Image as ImageIcon, Smartphone, X } from "lucide-react-native";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";

import { useThemeColors } from "@/hooks/useTheme";
import type { StoredFile } from "@/lib/api";
import { EXPRESS_MAX_FILES, expressFileProblem, filePageCount, filePaperName } from "@/lib/express";
import { formatStorage } from "@/lib/myFiles";
import { FILE_PICKER_NEEDS_REBUILD, getDocumentPickerNative } from "@/lib/nativeModules";
import { useExpress, type ExpressUpload } from "@/store/express";

const DOCUMENT_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/png",
  "image/jpeg",
];

function FileRow({ file, divided }: { file: StoredFile; divided: boolean }) {
  const colors = useThemeColors();
  const problem = expressFileProblem(file);
  const pages = filePageCount(file);
  const paper = filePaperName(file.detected);
  const Icon = file.detectedContentType.startsWith("image/") ? ImageIcon : FileText;
  const facts = [pages ? `${pages} ${pages === 1 ? "page" : "pages"}` : null, paper, formatStorage(file.size)]
    .filter(Boolean)
    .join(" · ");
  return (
    <View className={divided ? "flex-row items-center gap-3 border-t border-outline-subtle py-2 pl-4" : "flex-row items-center gap-3 py-2 pl-4"}>
      <View className="h-10 w-10 items-center justify-center rounded-md bg-surface-variant">
        <Icon size={20} color={colors.textSecondary} strokeWidth={2} aria-hidden />
      </View>
      <View className="min-w-0 flex-1">
        <Text className="text-body font-medium text-text-primary" numberOfLines={1}>
          {file.originalFilename}
        </Text>
        <Text className={problem ? "text-caption text-error" : "text-caption text-text-muted"} numberOfLines={2}>
          {problem ?? facts}
        </Text>
      </View>
      {problem ? (
        <CircleAlert size={20} color={colors.error} strokeWidth={2} accessibilityLabel="Cannot print" />
      ) : (
        <CircleCheck size={20} color={colors.success} strokeWidth={2} accessibilityLabel="Ready" />
      )}
      <Pressable
        onPress={() => useExpress.getState().removeFile(file.fileId)}
        accessibilityRole="button"
        accessibilityLabel={`Remove ${file.originalFilename}`}
        className="gg-touch items-center justify-center"
      >
        <X size={18} color={colors.textMuted} strokeWidth={2} aria-hidden />
      </Pressable>
    </View>
  );
}

function UploadRow({ upload, divided }: { upload: ExpressUpload; divided: boolean }) {
  const colors = useThemeColors();
  const percent = upload.progress == null ? null : Math.round(upload.progress * 100);
  return (
    <View className={divided ? "flex-row items-center gap-3 border-t border-outline-subtle py-2 pl-4" : "flex-row items-center gap-3 py-2 pl-4"}>
      <View className="h-10 w-10 items-center justify-center rounded-md bg-surface-variant">
        <FileText size={20} color={colors.textMuted} strokeWidth={2} aria-hidden />
      </View>
      <View className="min-w-0 flex-1 gap-1">
        <Text className="text-body font-medium text-text-primary" numberOfLines={1}>
          {upload.name}
        </Text>
        {upload.error ? (
          <Text className="text-caption text-error" numberOfLines={2} accessibilityRole="alert">
            {upload.error}
          </Text>
        ) : (
          <View className="h-1 overflow-hidden rounded-pill bg-surface-variant" accessibilityRole="progressbar" accessibilityLabel={`Uploading ${percent ?? 0}%`}>
            <View className="h-1 bg-accent" style={{ width: `${percent ?? 5}%` }} />
          </View>
        )}
      </View>
      <Pressable
        onPress={() => useExpress.getState().dismissUpload(upload.key)}
        accessibilityRole="button"
        accessibilityLabel={upload.error ? `Dismiss ${upload.name}` : `Stop uploading ${upload.name}`}
        className="gg-touch items-center justify-center"
      >
        <X size={18} color={colors.textMuted} strokeWidth={2} aria-hidden />
      </Pressable>
    </View>
  );
}

function AddButton({ icon: Icon, label, onPress, disabled }: { icon: typeof Smartphone; label: string; onPress: () => void; disabled: boolean }) {
  const colors = useThemeColors();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      className={disabled ? "gg-btn-secondary gg-disabled flex-1" : "gg-btn-secondary flex-1"}
    >
      <Icon size={18} color={colors.textPrimary} strokeWidth={2} aria-hidden />
      <Text className="text-button text-text-primary">{label}</Text>
    </Pressable>
  );
}

/** Step one: the documents. Each shows what GRIDGO read from it before anything is priced. */
export function FilesStep() {
  const router = useRouter();
  const colors = useThemeColors();
  const files = useExpress((state) => state.files);
  const uploads = useExpress((state) => state.uploads);
  const [pickError, setPickError] = useState<string | null>(null);
  const full = files.length + uploads.length >= EXPRESS_MAX_FILES;

  const pickFromPhone = async () => {
    setPickError(null);
    const picker = getDocumentPickerNative();
    if (!picker) {
      setPickError(FILE_PICKER_NEEDS_REBUILD);
      return;
    }
    try {
      const result = await picker.getDocumentAsync({ type: DOCUMENT_TYPES, multiple: true, copyToCacheDirectory: true });
      if (result.canceled) return;
      for (const asset of result.assets ?? []) {
        if (!asset?.uri) continue;
        useExpress.getState().upload({
          uri: asset.uri,
          name: asset.name,
          mimeType: asset.mimeType ?? null,
          file: "file" in asset ? (asset as { file?: Blob }).file : undefined,
        });
      }
    } catch {
      setPickError("The picker did not open. Try again.");
    }
  };

  const empty = files.length === 0 && uploads.length === 0;

  return (
    <View className="gap-3">
      {empty ? (
        <View className="items-center gap-2 rounded-card border border-dashed border-outline bg-surface px-6 py-10">
          <FileText size={36} color={colors.textMuted} strokeWidth={1.5} aria-hidden />
          <Text className="text-h3 font-bold text-text-primary">Add your documents</Text>
          <Text className="text-center text-body text-text-secondary">PDF, Word or photos. We count the pages.</Text>
        </View>
      ) : (
        <View className="gg-card-flush">
          {files.map((file, index) => (
            <FileRow key={file.fileId} file={file} divided={index > 0} />
          ))}
          {uploads.map((upload, index) => (
            <UploadRow key={upload.key} upload={upload} divided={files.length + index > 0} />
          ))}
        </View>
      )}

      <View className="flex-row gap-2">
        <AddButton icon={Smartphone} label="This phone" onPress={() => void pickFromPhone()} disabled={full} />
        <AddButton
          icon={FolderOpen}
          label="My files"
          onPress={() => router.push({ pathname: "/my-files", params: { for: "express" } })}
          disabled={full}
        />
      </View>
      {pickError ? (
        <Text className="text-caption text-error" accessibilityRole="alert">
          {pickError}
        </Text>
      ) : (
        <Text className="text-caption text-text-muted">
          {full ? `Up to ${EXPRESS_MAX_FILES} files per order.` : "From Drive or Canva? Download it first, then add it here."}
        </Text>
      )}
    </View>
  );
}
