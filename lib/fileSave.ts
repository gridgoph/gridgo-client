/**
 * Keeping a file GRIDGO only hands to a signed-in person: a statement, an
 * approval record.
 *
 * The bytes are fetched with the session's bearer, so they cannot be opened as
 * a plain link. No new library: the web downloads a blob, iOS opens its share
 * panel (React Native's `Share` takes a file URL there), and Android asks for a
 * folder through the Storage Access Framework that `expo-file-system` already
 * carries.
 */

import { Platform, Share } from "react-native";

import { getFileSystemLegacyNative } from "@/lib/nativeModules";

export type SaveOutcome =
  | { kind: "saved"; message: string | null }
  /** GRIDGO answered with something other than the file. */
  | { kind: "refused"; status: number; body: string }
  /** This binary has no file system module; a rebuild is needed. */
  | { kind: "unavailable" };

async function saveOnWeb(url: string, headers: Record<string, string>, name: string): Promise<SaveOutcome> {
  const response = await fetch(url, { headers });
  if (!response.ok) return { kind: "refused", status: response.status, body: await response.text() };
  const blob = await response.blob();
  const href = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = href;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(href), 10_000);
  return { kind: "saved", message: `Downloaded ${name}.` };
}

/** Throws only when the network does; every answer from GRIDGO is an outcome. */
export async function saveSignedInFile(
  { url, headers }: { url: string; headers: Record<string, string> },
  name: string,
  mime: string,
): Promise<SaveOutcome> {
  if (Platform.OS === "web") return saveOnWeb(url, headers, name);

  const FileSystem = getFileSystemLegacyNative();
  if (!FileSystem?.cacheDirectory) return { kind: "unavailable" };
  const local = `${FileSystem.cacheDirectory}${name}`;
  const downloaded = await FileSystem.downloadAsync(url, local, { headers });
  if (downloaded.status !== 200) {
    const body = await FileSystem.readAsStringAsync(downloaded.uri).catch(() => "");
    return { kind: "refused", status: downloaded.status, body };
  }

  if (Platform.OS === "android") {
    const saf = FileSystem.StorageAccessFramework;
    const permission = await saf.requestDirectoryPermissionsAsync();
    if (!permission.granted) return { kind: "saved", message: null };
    const target = await saf.createFileAsync(permission.directoryUri, name.replace(/\.[a-z0-9]+$/i, ""), mime);
    const bytes = await FileSystem.readAsStringAsync(downloaded.uri, { encoding: FileSystem.EncodingType.Base64 });
    await FileSystem.writeAsStringAsync(target, bytes, { encoding: FileSystem.EncodingType.Base64 });
    return { kind: "saved", message: `Saved ${name}.` };
  }

  await Share.share({ url: downloaded.uri, title: name });
  return { kind: "saved", message: null };
}

/** The `error` code in a refused body, or null. */
export function refusalCode(body: string): string | null {
  try {
    const parsed = JSON.parse(body) as { error?: unknown };
    return typeof parsed.error === "string" ? parsed.error : null;
  } catch {
    return null;
  }
}
