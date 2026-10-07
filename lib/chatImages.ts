export const SUPPORT_CHAT_IMAGE_PURPOSE = "support_chat_image";
export const SUPPORT_CHAT_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const SUPPORT_CHAT_IMAGE_MAX_BYTES = 15 * 1024 * 1024;
export const SUPPORT_CHAT_IMAGE_MAX_COUNT = 4;

export function validateChatImageAsset(asset: {
  name?: string | null;
  mimeType?: string | null;
  size?: number | null;
}): string | null {
  const type = asset.mimeType === "image/jpg" ? "image/jpeg" : (asset.mimeType || "");
  const name = String(asset.name || "").toLowerCase();
  const extensionOk = [".jpg", ".jpeg", ".png", ".webp"].some((ext) => name.endsWith(ext));
  const typeOk = SUPPORT_CHAT_IMAGE_TYPES.includes(type as (typeof SUPPORT_CHAT_IMAGE_TYPES)[number]);
  if (!typeOk && !extensionOk) return "Choose a JPEG, PNG, or WebP photo.";
  if (asset.size === 0) return "That file is empty.";
  if (typeof asset.size === "number" && asset.size > SUPPORT_CHAT_IMAGE_MAX_BYTES) {
    return "Photos can be up to 15 MB.";
  }
  return null;
}
