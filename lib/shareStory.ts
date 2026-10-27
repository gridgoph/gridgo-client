/**
 * Handing the story image and the invite link to the phone's share sheet.
 *
 * Each platform takes a different road, because each share sheet takes
 * different things:
 *
 * - **iOS**: React Native's own `Share` takes a file URL and a message
 *   together, so the picture and the link go in one sheet.
 * - **Android**: React Native's `Share` sends text only. The picture goes
 *   through expo-sharing, whose sheet carries a file and no text, so the
 *   invite link is put on the clipboard first and the card says so. An APK
 *   built before expo-sharing was added shares the text alone.
 * - **Web**: the Web Share API with a file where the browser allows it;
 *   otherwise the image downloads and the link is copied.
 *
 * Nothing here throws. A share sheet the client closes is `cancelled`, which
 * is not a failure and is never said as one. Android's chooser never says
 * whether anything was sent — it answers the same for a post and for Back —
 * so there the outcome is `opened`, never `shared`.
 */

import { Platform, Share } from "react-native";
import type Svg from "react-native-svg";

import { copyText } from "@/lib/copyText";
import { getFileSystemLegacyNative, getSharingNative } from "@/lib/nativeModules";
import { SHARE_CARD_TITLE, STORY_HEIGHT, STORY_WIDTH } from "@/lib/orderShare";

const CAPTURE_TIMEOUT_MS = 5000;

export type ShareOutcome =
  /** The client chose somewhere to share it (iOS, the web). */
  | { kind: "shared"; linkCopied: boolean }
  /** The sheet opened, and the phone does not say what came of it (Android). */
  | { kind: "opened"; linkCopied: boolean }
  /** The picture could not go, so the text went alone; `confirmed` when the phone said it was sent. */
  | { kind: "text_only"; confirmed: boolean }
  /** The browser had no share sheet: the picture downloaded instead. */
  | { kind: "saved"; linkCopied: boolean }
  | { kind: "cancelled" }
  | { kind: "failed"; linkCopied: boolean };

/** Whether this phone's share sheet takes the picture without the text (Android). */
export function sharesPictureWithoutText(): boolean {
  return Platform.OS === "android" && getSharingNative() != null && getFileSystemLegacyNative() != null;
}

/** The story picture as base64 PNG at full story size, or null when it could not be drawn. */
export function captureStory(svg: Svg | null): Promise<string | null> {
  if (!svg) return Promise.resolve(null);
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), CAPTURE_TIMEOUT_MS);
    try {
      svg.toDataURL(
        (data) => {
          clearTimeout(timer);
          resolve(data ? data.replace(/^data:image\/png;base64,/, "") : null);
        },
        { width: STORY_WIDTH, height: STORY_HEIGHT },
      );
    } catch {
      clearTimeout(timer);
      resolve(null);
    }
  });
}

function isAbort(error: unknown): boolean {
  return (error as { name?: unknown } | null)?.name === "AbortError";
}

async function failed(link: string | null): Promise<ShareOutcome> {
  return { kind: "failed", linkCopied: link ? await copyText(link) : false };
}

async function writePng(base64: string, fileName: string): Promise<string | null> {
  const FileSystem = getFileSystemLegacyNative();
  if (!FileSystem?.cacheDirectory) return null;
  const uri = `${FileSystem.cacheDirectory}${fileName}`;
  await FileSystem.writeAsStringAsync(uri, base64, { encoding: FileSystem.EncodingType.Base64 });
  return uri;
}

function pngFile(base64: string, fileName: string): File {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new File([bytes], fileName, { type: "image/png" });
}

async function shareOnWeb(png: string | null, text: string, link: string | null, fileName: string): Promise<ShareOutcome> {
  const file = png ? pngFile(png, fileName) : null;
  try {
    if (file && navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], text });
      return { kind: "shared", linkCopied: false };
    }
  } catch (error) {
    if (isAbort(error)) return { kind: "cancelled" };
    return failed(link);
  }
  if (!file) return failed(link);
  // A desktop browser has no share sheet for a picture: keep the picture.
  const href = URL.createObjectURL(file);
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(href), 10_000);
  return { kind: "saved", linkCopied: link ? await copyText(link) : false };
}

/**
 * Shares the story picture with `text` beside it. `png` is the image as base64
 * without its data-URL prefix; null when it could not be drawn, and then the
 * text goes alone.
 */
export async function shareStory({
  png,
  text,
  link,
  fileName,
}: {
  png: string | null;
  text: string;
  link: string | null;
  fileName: string;
}): Promise<ShareOutcome> {
  if (Platform.OS === "web") return shareOnWeb(png, text, link, fileName);
  try {
    if (Platform.OS === "android") {
      const Sharing = getSharingNative();
      const uri = png && Sharing ? await writePng(png, fileName) : null;
      if (Sharing && uri) {
        const linkCopied = link ? await copyText(link) : false;
        await Sharing.shareAsync(uri, { mimeType: "image/png", dialogTitle: SHARE_CARD_TITLE });
        return { kind: "opened", linkCopied };
      }
      await Share.share({ message: text, title: SHARE_CARD_TITLE });
      return { kind: "text_only", confirmed: false };
    }
    const uri = png ? await writePng(png, fileName) : null;
    const result = await Share.share(uri ? { url: uri, message: text } : { message: text });
    if (result.action === Share.dismissedAction) return { kind: "cancelled" };
    return uri ? { kind: "shared", linkCopied: false } : { kind: "text_only", confirmed: true };
  } catch {
    return failed(link);
  }
}

/** Send to a friend: the invite link alone, no picture and no other words. */
export async function shareLink(link: string): Promise<ShareOutcome> {
  if (Platform.OS === "web") {
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({ url: link });
        return { kind: "shared", linkCopied: false };
      }
    } catch (error) {
      if (isAbort(error)) return { kind: "cancelled" };
    }
    return failed(link);
  }
  try {
    if (Platform.OS === "android") {
      await Share.share({ message: link });
      return { kind: "opened", linkCopied: false };
    }
    const result = await Share.share({ url: link });
    if (result.action === Share.dismissedAction) return { kind: "cancelled" };
    return { kind: "shared", linkCopied: false };
  } catch {
    return failed(link);
  }
}
