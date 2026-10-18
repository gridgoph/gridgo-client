/**
 * Sending a drawn signature to GRIDGO as its `approval_signature` PNG.
 *
 * The PNG is made in memory (`lib/signature.ts`) and is small — a few hundred
 * kilobytes at most — so unlike artwork it can be held whole. The web hands
 * `FormData` a named File; a phone writes the bytes to the cache first, because
 * React Native's `FormData` streams a file part from a URI.
 */

import { Platform } from "react-native";

import * as api from "@/lib/api";
import { getFileSystemLegacyNative } from "@/lib/nativeModules";
import { bytesToBase64, signaturePng, type Signature } from "@/lib/signature";

export const SIGNATURE_PURPOSE = "approval_signature";

async function signatureAsset(png: Uint8Array): Promise<api.UploadAsset> {
  const name = `signature-${Date.now()}.png`;
  if (Platform.OS === "web") {
    const copy = new Uint8Array(png.length);
    copy.set(png);
    // A File, not a bare Blob: a Blob goes up named "blob", and GRIDGO refuses
    // a file whose name, bytes and type do not agree.
    return { uri: name, name, mimeType: "image/png", file: new File([copy.buffer], name, { type: "image/png" }) };
  }
  const base64 = bytesToBase64(png);
  const FileSystem = getFileSystemLegacyNative();
  if (FileSystem?.cacheDirectory) {
    const uri = `${FileSystem.cacheDirectory}${name}`;
    await FileSystem.writeAsStringAsync(uri, base64, { encoding: FileSystem.EncodingType.Base64 });
    return { uri, name, mimeType: "image/png" };
  }
  // React Native's networking reads a data URI as the file's bytes.
  return { uri: `data:image/png;base64,${base64}`, name, mimeType: "image/png" };
}

/** Uploads the signature and resolves with GRIDGO's file id once it is stored. */
export async function uploadSignature(signature: Signature): Promise<string> {
  const asset = await signatureAsset(signaturePng(signature));
  const file = await api.uploadFile(asset, SIGNATURE_PURPOSE).done;
  return file.fileId;
}
