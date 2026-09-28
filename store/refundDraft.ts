import { create } from "zustand";

import * as api from "@/lib/api";
import { artworkErrorMessage, normalizeFileName } from "@/lib/artworkUpload";
import { FILE_PICKER_NEEDS_REBUILD, getDocumentPickerNative } from "@/lib/nativeModules";
import {
  MAX_REFUND_EVIDENCE,
  REFUND_EVIDENCE_MAX_MIB,
  REFUND_QR_MAX_MIB,
} from "@/lib/refunds";
import type { RefundKind, RefundProvider } from "@/lib/api";

/** One picked image on its way to (or stored on) GRIDGO. */
export type RefundUpload = {
  key: string;
  phase: "sending" | "stored" | "failed";
  fileName: string;
  localUri: string | null;
  /** Only a `201` with an id sets this. Transfer progress is not success. */
  fileId: string | null;
  progress: number | null;
  error: string | null;
};

type Draft = {
  /** `request:<orderId>` or `account:<refundId>`. A new scope starts empty. */
  scope: string | null;
  kind: RefundKind | null;
  reason: string;
  evidence: RefundUpload[];
  qr: RefundUpload | null;
  provider: RefundProvider | null;
  accountName: string;
  ownershipConfirmed: boolean;
  /**
   * The key for the body as it stands. Any edit clears it, so a retry of the
   * same body replays and a changed body is a new request.
   */
  idempotencyKey: string | null;
  /** Raised by the tap that sends, lowered in its `finally`. */
  busy: boolean;
  error: string | null;
};

type Actions = {
  bind: (scope: string) => void;
  reset: () => void;
  setKind: (kind: RefundKind) => void;
  setReason: (reason: string) => void;
  setProvider: (provider: RefundProvider) => void;
  setAccountName: (name: string) => void;
  setOwnershipConfirmed: (confirmed: boolean) => void;
  pickQr: () => Promise<void>;
  addEvidence: () => Promise<void>;
  removeEvidence: (key: string) => void;
  /** The key to send with the current body, minted on first use. */
  keyForSend: () => string;
  setBusy: (busy: boolean) => void;
  setError: (error: string | null) => void;
};

const EMPTY: Draft = {
  scope: null,
  kind: null,
  reason: "",
  evidence: [],
  qr: null,
  provider: null,
  accountName: "",
  ownershipConfirmed: false,
  idempotencyKey: null,
  busy: false,
  error: null,
};

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const handles = new Map<string, api.UploadHandle>();
let uploadSeq = 0;

function cancelAll() {
  for (const handle of handles.values()) handle.cancel();
  handles.clear();
}

type Picked = { asset: api.UploadAsset & { size?: number } } | { error: string } | null;

async function pickImage(): Promise<Picked> {
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
    if (!asset?.uri) return { error: "That image could not be read. Take the screenshot again, or pick it from Photos." };
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

export const useRefundDraft = create<Draft & Actions>((set, get) => {
  /** Stream one image to `POST /files`, writing its progress through `write`. */
  const upload = (
    asset: api.UploadAsset & { size?: number },
    purpose: "refund_qr" | "refund_evidence",
    maxMiB: number,
    write: (slot: RefundUpload | ((slot: RefundUpload) => RefundUpload)) => void,
  ) => {
    const key = `upload-${++uploadSeq}`;
    const base: RefundUpload = {
      key,
      phase: "sending",
      fileName: asset.name,
      localUri: asset.uri,
      fileId: null,
      progress: 0,
      error: null,
    };
    if (asset.size != null && asset.size > maxMiB * 1024 * 1024) {
      write({ ...base, phase: "failed", progress: null, error: `This image is over ${maxMiB} MB. Send a screenshot rather than a full photo.` });
      return;
    }
    write(base);
    const scope = get().scope;
    const handle = api.uploadFile(asset, purpose, (fraction) => {
      if (get().scope === scope) write((slot) => (slot.key === key && slot.phase === "sending" ? { ...slot, progress: fraction } : slot));
    });
    handles.set(key, handle);
    handle.done
      .then((file) => {
        if (get().scope !== scope) return;
        write((slot) => (slot.key === key ? { ...slot, phase: "stored", fileId: file.fileId, progress: 1 } : slot));
      })
      .catch((error: unknown) => {
        if (get().scope !== scope) return;
        write((slot) =>
          slot.key === key
            ? { ...slot, phase: "failed", progress: null, error: `${artworkErrorMessage(error)} GRIDGO takes JPEG, PNG or WebP images.` }
            : slot,
        );
      })
      .finally(() => handles.delete(key));
  };

  const edited = { idempotencyKey: null, error: null };

  return {
    ...EMPTY,
    bind: (scope) => {
      if (get().scope === scope) return;
      cancelAll();
      set({ ...EMPTY, scope });
    },
    reset: () => {
      cancelAll();
      set({ ...EMPTY });
    },
    setKind: (kind) => set({ kind, ...edited }),
    setReason: (reason) => set({ reason, ...edited }),
    setProvider: (provider) => set({ provider, ...edited }),
    setAccountName: (accountName) => set({ accountName, ...edited }),
    setOwnershipConfirmed: (ownershipConfirmed) => set({ ownershipConfirmed, ...edited }),
    pickQr: async () => {
      const picked = await pickImage();
      if (!picked) return;
      const previous = get().qr;
      if (previous) handles.get(previous.key)?.cancel();
      if ("error" in picked) {
        set({ qr: { key: `upload-${++uploadSeq}`, phase: "failed", fileName: "", localUri: null, fileId: null, progress: null, error: picked.error }, ...edited });
        return;
      }
      set(edited);
      upload(picked.asset, "refund_qr", REFUND_QR_MAX_MIB, (next) =>
        set((state) => {
          const slot = typeof next === "function" ? (state.qr ? next(state.qr) : null) : next;
          return { qr: slot, idempotencyKey: null };
        }),
      );
    },
    addEvidence: async () => {
      if (get().evidence.length >= MAX_REFUND_EVIDENCE) return;
      const picked = await pickImage();
      if (!picked) return;
      if ("error" in picked) {
        set({ error: picked.error });
        return;
      }
      set(edited);
      let key: string | null = null;
      upload(picked.asset, "refund_evidence", REFUND_EVIDENCE_MAX_MIB, (next) =>
        set((state) => {
          if (typeof next !== "function") {
            key = next.key;
            const exists = state.evidence.some((slot) => slot.key === next.key);
            return {
              evidence: exists
                ? state.evidence.map((slot) => (slot.key === next.key ? next : slot))
                : [...state.evidence, next],
              idempotencyKey: null,
            };
          }
          return { evidence: state.evidence.map((slot) => (slot.key === key ? next(slot) : slot)), idempotencyKey: null };
        }),
      );
    },
    removeEvidence: (key) => {
      handles.get(key)?.cancel();
      handles.delete(key);
      set((state) => ({ evidence: state.evidence.filter((slot) => slot.key !== key), ...edited }));
    },
    keyForSend: () => {
      const existing = get().idempotencyKey;
      if (existing) return existing;
      const key = api.newIdempotencyKey();
      set({ idempotencyKey: key });
      return key;
    },
    setBusy: (busy) => set({ busy }),
    setError: (error) => set({ error }),
  };
});
