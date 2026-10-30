/**
 * Keep GRIDGO's payment QR: Android shares a cached file; iOS saves to photos.
 *
 * Permission is asked on the tap, never when the sheet opens. A denial is a
 * line of what to do — GRIDGO cannot raise the dialog again once it is blocked.
 */

import { Platform } from "react-native";

import { Asset } from "expo-asset";

import { images } from "@/constants/images";
import { notificationImageUrl } from "@/lib/api";
import { getFileSystemLegacyNative, getMediaLibraryNative, getSharingNative } from "@/lib/nativeModules";

export const SAVE_QR_LABEL = "Save QR";
export const SAVE_QR_A11Y = Platform.OS === "android" ? "Save or share QR" : "Save to photos";
export const SAVE_QR_DENIED =
  "Allow GRIDGO to save photos in Settings so you can keep this QR.";
export const SAVE_QR_SAVED = Platform.OS === "android"
  ? "Choose an app in the share sheet to save or use the QR."
  : "Saved to photos.";
export const SAVE_QR_FAILED = "The QR could not be saved. Try again.";
export const SAVE_QR_NEEDS_REBUILD =
  "Saving the QR needs a rebuilt GRIDGO app on this phone.";

export type SaveQrResult =
  | { ok: true }
  | { ok: false; reason: "denied" | "failed" | "rebuild" };

export function saveQrMessage(result: SaveQrResult): string {
  if (result.ok) return SAVE_QR_SAVED;
  if (result.reason === "denied") return SAVE_QR_DENIED;
  if (result.reason === "rebuild") return SAVE_QR_NEEDS_REBUILD;
  return SAVE_QR_FAILED;
}

async function bundledQrUri(): Promise<string> {
  const asset = Asset.fromModule(images.gcashQr as number);
  await asset.downloadAsync();
  const uri = asset.localUri ?? asset.uri;
  if (!uri) throw new Error("bundled QR missing");
  return uri;
}

async function localUriFor(imageUrl?: string | null): Promise<string> {
  const remote = notificationImageUrl(imageUrl);
  if (!remote) return bundledQrUri();

  const FileSystem = getFileSystemLegacyNative();
  if (!FileSystem?.cacheDirectory) return bundledQrUri();
  const dest = `${FileSystem.cacheDirectory}gridgo-payment-qr.jpg`;
  const downloaded = await FileSystem.downloadAsync(remote, dest);
  if (!downloaded?.uri) throw new Error("download empty");
  return downloaded.uri;
}

/**
 * Android uses the share sheet without gallery permissions, including on older
 * devices. iOS keeps its write-only photo save. Opening a share sheet does not
 * prove the user saved, so the Android result copy makes no saved claim.
 */
export async function savePaymentQrToPhotos(imageUrl?: string | null): Promise<SaveQrResult> {
  if (Platform.OS === "android") {
    const Sharing = getSharingNative();
    if (!Sharing) return { ok: false, reason: "rebuild" };
    try {
      if (!(await Sharing.isAvailableAsync())) return { ok: false, reason: "failed" };
      await Sharing.shareAsync(await localUriFor(imageUrl), {
        mimeType: "image/*",
        dialogTitle: "Save or share payment QR",
      });
      return { ok: true };
    } catch {
      return { ok: false, reason: "failed" };
    }
  }

  const MediaLibrary = getMediaLibraryNative();
  if (!MediaLibrary) return { ok: false, reason: "rebuild" };

  try {
    const permission = await MediaLibrary.requestPermissionsAsync(true);
    if (!permission.granted) return { ok: false, reason: "denied" };
    const uri = await localUriFor(imageUrl);
    await MediaLibrary.saveToLibraryAsync(uri);
    return { ok: true };
  } catch {
    return { ok: false, reason: "failed" };
  }
}
