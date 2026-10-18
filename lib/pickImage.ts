/**
 * Picking one image for an upload: a refund's QR or evidence, a received
 * sample. The document picker rather than the camera picker, because it is
 * what every build carries and it opens Photos and Files alike; on web it is
 * the browser's own file input (`lib/webFilePick.ts`).
 */

import type { UploadAsset } from "@/lib/api";
import { normalizeFileName } from "@/lib/artworkUpload";
import { FILE_PICKER_NEEDS_REBUILD, getDocumentPickerNative } from "@/lib/nativeModules";

export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

export type PickedImage = { asset: UploadAsset & { size?: number } } | { error: string } | null;

/** Null when the client closed the picker. */
export async function pickImage(
  unreadable = "That image could not be read. Pick it again from Photos.",
): Promise<PickedImage> {
  const picker = getDocumentPickerNative();
  if (!picker) return { error: FILE_PICKER_NEEDS_REBUILD };
  try {
    const result = await picker.getDocumentAsync({
      type: IMAGE_TYPES,
      multiple: false,
      copyToCacheDirectory: true,
    });
    if (result.canceled) return null;
    const asset = result.assets?.[0];
    if (!asset?.uri) return { error: unreadable };
    return {
      asset: {
        uri: asset.uri,
        name: normalizeFileName(asset.name),
        mimeType: asset.mimeType ?? null,
        file: "file" in asset ? (asset as { file?: Blob }).file : undefined,
        size: typeof asset.size === "number" ? asset.size : undefined,
      },
    };
  } catch {
    return { error: "The picker did not open. Try again, and check GRIDGO has access to your photos." };
  }
}
