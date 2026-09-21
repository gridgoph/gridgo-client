/**
 * OCR a receipt screenshot.
 *
 * Native (Expo Go): queue a job for the root-layout WebView host.
 * Web: Tesseract runs in this page. react-native-webview is a 16px iframe
 * here and never finishes, which is why checkout on the browser used to
 * say the number could not be read.
 *
 * `recognizeReceiptFromUri` is the one call site. Tests replace it with a
 * fixture so Jest never waits on a WebView or a CDN download.
 */

import { Platform } from "react-native";

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
  if (uri.startsWith("blob:")) {
    const response = await fetch(uri);
    if (!response.ok) throw new Error("That screenshot could not be read.");
    const blob = await response.blob();
    return blobToDataUrl(blob);
  }
  const FileSystem = getFileSystemLegacyNative();
  if (!FileSystem) {
    throw new Error("Reading the screenshot needs the file system on this phone.");
  }
  const base64 = await FileSystem.readAsStringAsync(uri, { encoding: "base64" });
  return `data:${mimeFromUri(uri)};base64,${base64}`;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("That screenshot could not be read."));
    };
    reader.onerror = () => reject(new Error("That screenshot could not be read."));
    reader.readAsDataURL(blob);
  });
}

type TesseractWorker = {
  recognize: (image: HTMLCanvasElement | string) => Promise<{
    data: { text?: string; confidence?: number };
  }>;
  terminate: () => Promise<void>;
};

type TesseractNS = {
  createWorker: (
    lang: string,
    oem: number,
    options: Record<string, unknown>,
  ) => Promise<TesseractWorker>;
};

const TESSERACT_SRC =
  "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js";

let tesseractPromise: Promise<TesseractNS> | null = null;

/** Expo web has a real browser; the native WebView host does not run there. */
export function canRecognizeInBrowser(): boolean {
  return (
    Platform.OS === "web" &&
    typeof document !== "undefined" &&
    typeof document.createElement === "function"
  );
}

function loadTesseract(): Promise<TesseractNS> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Receipt OCR runs in the browser."));
  }
  const existing = (window as Window & { Tesseract?: TesseractNS }).Tesseract;
  if (existing) return Promise.resolve(existing);
  if (tesseractPromise) return tesseractPromise;
  tesseractPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = TESSERACT_SRC;
    script.async = true;
    script.onload = () => {
      const loaded = (window as Window & { Tesseract?: TesseractNS }).Tesseract;
      if (loaded) resolve(loaded);
      else reject(new Error("The receipt reader could not download."));
    };
    script.onerror = () => {
      tesseractPromise = null;
      reject(new Error("The receipt reader could not download."));
    };
    document.head.appendChild(script);
  });
  return tesseractPromise;
}

/** Same scale + contrast the WebView host applies to a narrow wallet screenshot. */
export async function receiptImageFromUrl(source: string): Promise<HTMLCanvasElement> {
  const img = new Image();
  img.src = source;
  await img.decode();
  const scale = Math.min(3, Math.max(1, 1200 / img.naturalWidth));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.naturalWidth * scale);
  canvas.height = Math.round(img.naturalHeight * scale);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("That screenshot could not be read.");
  context.drawImage(img, 0, 0, canvas.width, canvas.height);
  boostReceiptContrast(context, canvas.width, canvas.height);
  return canvas;
}

function boostReceiptContrast(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
): void {
  const image = context.getImageData(0, 0, width, height);
  const data = image.data;
  for (let i = 0; i < data.length; i += 4) {
    const y = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    const v = Math.max(0, Math.min(255, (y - 128) * 1.6 + 128));
    data[i] = data[i + 1] = data[i + 2] = v;
  }
  context.putImageData(image, 0, 0);
}

export async function recognizeReceiptInBrowser(
  dataUrl: string,
  isCurrent: () => boolean = () => true,
): Promise<ReceiptOcrRaw> {
  const Tesseract = await loadTesseract();
  if (!isCurrent()) throw new Error("replaced");
  const canvas = await receiptImageFromUrl(dataUrl);
  if (!isCurrent()) throw new Error("replaced");
  const worker = await Tesseract.createWorker("eng", 1, {
    workerPath: "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/worker.min.js",
    corePath: "https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.1",
    langPath: "https://cdn.jsdelivr.net/npm/@tesseract.js-data/eng@1.0.0/4.0.0_best_int",
    logger: () => {},
  });
  try {
    if (!isCurrent()) throw new Error("replaced");
    const result = await worker.recognize(canvas);
    return {
      text: result.data.text ?? "",
      confidence: typeof result.data.confidence === "number" ? result.data.confidence : 0,
    };
  } finally {
    await worker.terminate();
  }
}

/**
 * Read the local screenshot and run Tesseract.
 * On a phone the WebView host must be mounted (root layout) or this waits
 * until timeout. In the browser it runs here and does not use that host.
 */
export async function recognizeReceiptFromUri(
  uri: string,
  isCurrent: () => boolean = () => true,
): Promise<ReceiptOcrRaw> {
  const dataUrl = await imageUriToDataUrl(uri);
  if (!isCurrent()) throw new Error("replaced");
  if (canRecognizeInBrowser()) return recognizeReceiptInBrowser(dataUrl, isCurrent);
  return enqueueReceiptOcr(dataUrl);
}
