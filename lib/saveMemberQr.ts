/**
 * Keeping the members' join QR as a picture: a download on the web, the share
 * panel on Android (no gallery permission), the photo library on iOS.
 */

import { Platform } from "react-native";
import type Svg from "react-native-svg";

import { getFileSystemLegacyNative, getMediaLibraryNative, getSharingNative } from "@/lib/nativeModules";
import type { InviteNotice } from "@/store/memberInvite";

export const QR_PICTURE = { width: 1080, height: 1320 } as const;
const CAPTURE_TIMEOUT_MS = 6000;
const FAILED: InviteNotice = { tone: "error", message: "The QR could not be saved. Take a screenshot of it instead." };

function capture(svg: Svg | null): Promise<string | null> {
  if (!svg) return Promise.resolve(null);
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), CAPTURE_TIMEOUT_MS);
    try {
      svg.toDataURL((data) => {
        clearTimeout(timer);
        resolve(data ? data.replace(/^data:image\/png;base64,/, "") : null);
      }, QR_PICTURE);
    } catch {
      clearTimeout(timer);
      resolve(null);
    }
  });
}

/** What to tell the officer, or null when the phone's own panel already said it. */
export async function saveMemberQr(svg: Svg | null, fileName: string): Promise<InviteNotice | null> {
  const png = await capture(svg);
  if (!png) return FAILED;
  try {
    if (Platform.OS === "web") {
      const anchor = document.createElement("a");
      anchor.href = `data:image/png;base64,${png}`;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      return { tone: "success", message: "QR downloaded." };
    }
    const FileSystem = getFileSystemLegacyNative();
    if (!FileSystem?.cacheDirectory) return FAILED;
    const uri = `${FileSystem.cacheDirectory}${fileName}`;
    await FileSystem.writeAsStringAsync(uri, png, { encoding: FileSystem.EncodingType.Base64 });
    if (Platform.OS === "android") {
      const Sharing = getSharingNative();
      if (!Sharing || !(await Sharing.isAvailableAsync())) return FAILED;
      await Sharing.shareAsync(uri, { mimeType: "image/png", dialogTitle: "Save or share the QR" });
      return null;
    }
    const MediaLibrary = getMediaLibraryNative();
    if (!MediaLibrary) return FAILED;
    const permission = await MediaLibrary.requestPermissionsAsync(true);
    if (!permission.granted) {
      return { tone: "error", message: "Allow GRIDGO to save photos in Settings, then try again." };
    }
    await MediaLibrary.saveToLibraryAsync(uri);
    return { tone: "success", message: "QR saved to your photos." };
  } catch {
    return FAILED;
  }
}
