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

type PickedPhoto = { uri: string; name?: string | null; mimeType?: string | null; size?: number | null };

/**
 * Adds picked photos to a message's unsent ones, or says why it cannot. The
 * support chat and the delivery chat both take up to four photos per message.
 */
export function addChatPhotos<T extends { uri: string; name: string; mimeType?: string | null }>(
  pending: T[],
  assets: PickedPhoto[],
  toPending: (asset: { uri: string; name: string; mimeType: string }) => T,
): { ok: true; pending: T[] } | { ok: false; error: string } {
  const next = [...pending];
  for (const asset of assets) {
    const problem = validateChatImageAsset(asset);
    if (problem) return { ok: false, error: problem };
    if (next.length >= SUPPORT_CHAT_IMAGE_MAX_COUNT) {
      return { ok: false, error: `A message can include up to ${SUPPORT_CHAT_IMAGE_MAX_COUNT} photos.` };
    }
    next.push(toPending({ uri: asset.uri, name: asset.name || "photo.jpg", mimeType: asset.mimeType || "image/jpeg" }));
  }
  return { ok: true, pending: next };
}
