/**
 * OCR a receipt screenshot via the WebView Tesseract host.
 *
 * `recognizeReceiptFromUri` is the one call site. Tests replace it with a
 * fixture so Jest never waits on a WebView.
 */

import { getFileSystemLegacyNative } from "@/lib/nativeModules";

export type ReceiptOcrRaw = { text: string; confidence: number };

export type ReceiptOcrRequest = { id: number; dataUrl: string };

type Job = ReceiptOcrRequest & {
  resolve: (result: ReceiptOcrRaw) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

const OCR_TIMEOUT_MS = 45_000;

let job: Job | null = null;
let nextId = 0;
const listeners = new Set<() => void>();

export function subscribeReceiptOcr(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Stable snapshot: React Compiler cannot track a mutable module read in render. */
export function pendingReceiptOcr(): ReceiptOcrRequest | null {
  return job;
}

function notify(): void {
  listeners.forEach((fn) => fn());
}

function clearJob(): Job | null {
  const current = job;
  job = null;
  if (current) clearTimeout(current.timer);
  notify();
  return current;
}

export function completeReceiptOcr(id: number, result: ReceiptOcrRaw): void {
  if (job?.id === id) clearJob()?.resolve(result);
}

export function failReceiptOcr(id: number, message: string): void {
  if (job?.id === id) clearJob()?.reject(new Error(message));
}

export function enqueueReceiptOcr(dataUrl: string): Promise<ReceiptOcrRaw> {
  const previous = clearJob();
  previous?.reject(new Error("replaced"));
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    job = {
      id,
      dataUrl,
      resolve,
      reject,
      timer: setTimeout(() => {
        failReceiptOcr(id, "The screenshot took too long to read.");
      }, OCR_TIMEOUT_MS),
    };
    notify();
  });
}

function mimeFromUri(uri: string): string {
  const lower = uri.toLowerCase();
  if (lower.includes(".png")) return "image/png";
  if (lower.includes(".webp")) return "image/webp";
  return "image/jpeg";
}

export async function imageUriToDataUrl(uri: string): Promise<string> {
  if (uri.startsWith("data:")) return uri;
  const FileSystem = getFileSystemLegacyNative();
  if (!FileSystem) {
    throw new Error("Reading the screenshot needs the file system on this phone.");
  }
  const base64 = await FileSystem.readAsStringAsync(uri, { encoding: "base64" });
  return `data:${mimeFromUri(uri)};base64,${base64}`;
}

/**
 * Read the local screenshot and run Tesseract in the WebView host.
 * The host must be mounted (checkout overlays it) or this waits until timeout.
 */
export async function recognizeReceiptFromUri(
  uri: string,
  isCurrent: () => boolean = () => true,
): Promise<ReceiptOcrRaw> {
  const dataUrl = await imageUriToDataUrl(uri);
  if (!isCurrent()) throw new Error("replaced");
  return enqueueReceiptOcr(dataUrl);
}
