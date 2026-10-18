import { create } from "zustand";

import * as api from "@/lib/api";
import type { CancellationQuote, RefundKind, RefundProvider } from "@/lib/api";
import { refundErrorMessage } from "@/lib/copy";
import { failedUpload, uploadImage, writeSlot, type ImageUpload, type SlotWrite } from "@/lib/imageUpload";
import { pickImage as pickAnyImage } from "@/lib/pickImage";
import {
  MAX_REFUND_EVIDENCE,
  REFUND_EVIDENCE_MAX_MIB,
  REFUND_QR_MAX_MIB,
  cancellationQuoteRefusal,
  type QuoteRefusal,
} from "@/lib/refunds";

/** One picked image on its way to (or stored on) GRIDGO. */
export type RefundUpload = ImageUpload;

/**
 * The cancellation quote as the screen draws it. Only `ready` carries an
 * amount the client may confirm; `refused` says why there is none.
 */
export type QuoteRead =
  | { phase: "idle" }
  | { phase: "loading" }
  | { phase: "ready"; quote: CancellationQuote }
  | { phase: "refused"; refusal: QuoteRefusal }
  | { phase: "failed"; message: string };

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
  quote: QuoteRead;
  /** Said once the amount was checked again after a stale confirmation. */
  quoteNotice: string | null;
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
  /**
   * Read what cancelling returns now. A new token is a new body, so it
   * clears the idempotency key. Resolves the quote, or null when there is none.
   */
  loadQuote: (orderId: string) => Promise<CancellationQuote | null>;
  /** The quote the client was shown went stale: read it again and say what changed. */
  requote: (orderId: string, shown: CancellationQuote | null) => Promise<void>;
  /** A refusal that arrived with the send rather than the read. */
  setQuoteRefusal: (refusal: QuoteRefusal) => void;
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
  quote: { phase: "idle" },
  quoteNotice: null,
};

const REFUND_UNREADABLE = "That image could not be read. Take the screenshot again, or pick it from Photos.";
const pickImage = () => pickAnyImage(REFUND_UNREADABLE);

const handles = new Map<string, api.UploadHandle>();

function cancelAll() {
  for (const handle of handles.values()) handle.cancel();
  handles.clear();
}

export const useRefundDraft = create<Draft & Actions>((set, get) => {
  /** Stream one image to `POST /files`, writing its progress through `write`. */
  const upload = (
    asset: api.UploadAsset & { size?: number },
    purpose: "refund_qr" | "refund_evidence",
    maxMiB: number,
    write: SlotWrite,
  ) => {
    const scope = get().scope;
    const { key, handle } = uploadImage({
      asset,
      purpose,
      maxMiB,
      write,
      stillCurrent: () => get().scope === scope,
      onSettled: (settled) => handles.delete(settled),
    });
    if (handle) handles.set(key, handle);
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
        set({ qr: failedUpload(picked.error), ...edited });
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
      let key = "";
      upload(picked.asset, "refund_evidence", REFUND_EVIDENCE_MAX_MIB, (next) =>
        set((state) => {
          if (typeof next !== "function") key = next.key;
          return { evidence: writeSlot(state.evidence, key, next), idempotencyKey: null };
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
    loadQuote: async (orderId) => {
      const scope = get().scope;
      set({ quote: { phase: "loading" }, idempotencyKey: null });
      try {
        const quote = await api.getCancellationQuote(orderId);
        if (get().scope === scope) set({ quote: { phase: "ready", quote }, idempotencyKey: null });
        return quote;
      } catch (error) {
        if (get().scope !== scope) return null;
        const refusal = cancellationQuoteRefusal(error);
        set({
          quote: refusal
            ? { phase: "refused", refusal }
            : {
                phase: "failed",
                message: refundErrorMessage(error, "GRIDGO could not work out the refund just now. Check your connection and try again."),
              },
          idempotencyKey: null,
        });
        return null;
      }
    },
    requote: async (orderId, shown) => {
      set({ quoteNotice: null });
      const fresh = await get().loadQuote(orderId);
      if (!fresh) return;
      const amount = api.formatPhp(fresh.refund.totalMinor);
      set({
        quoteNotice:
          shown && shown.refund.totalMinor === fresh.refund.totalMinor
            ? `Something on this order changed while you were deciding. GRIDGO checked again: you still get back ${amount}. Confirm again to send it.`
            : `The amount changed while you were deciding. You now get back ${amount} — check it below, then confirm again.`,
      });
    },
    setQuoteRefusal: (refusal) => set({ quote: { phase: "refused", refusal }, idempotencyKey: null }),
  };
});
