import { create } from "zustand";

import * as api from "@/lib/api";
import type { ApprovalMethod } from "@/lib/api";
import { artworkErrorMessage } from "@/lib/artworkUpload";
import { pickImage } from "@/lib/pickImage";
import { signatureIsBlank, signatureKey, type Signature } from "@/lib/signature";
import { uploadSignature } from "@/lib/signatureUpload";

/**
 * The client's approval while it is being given (gridgo-client#248).
 *
 * Keyed by what it approves — a basket (`cart:<id>`) or an order's sample
 * (`order:<id>`) — and bound to the exact version reviewed: the basket's
 * `version`, or the review fingerprint of an order. When that moves, the
 * approval no longer counts and the client is asked again, the same rule
 * GRIDGO applies (`approval_cart_stale` / `approval_snapshot_stale`).
 *
 * Memory only, never persisted, and never given by anything but the client's
 * own tap or hand.
 */
export type ApprovalDraft = {
  method: ApprovalMethod;
  /** The basket version or review fingerprint this was given against. */
  reviewed: string;
  /** Set for a drawn approval. */
  signature: Signature | null;
};

/** The photo of a received sample, on its way to (or stored on) GRIDGO. */
export type SamplePhotoUpload = {
  phase: "sending" | "stored" | "failed";
  fileName: string | null;
  localUri: string | null;
  /** Only a `201` with an id sets this. Transfer progress is not success. */
  fileId: string | null;
  error: string | null;
};

/** `approval_sample_photo`: JPEG, PNG or WebP up to 20 MiB. */
export const SAMPLE_PHOTO_MAX_MIB = 20;

type ApprovalState = {
  drafts: Record<string, ApprovalDraft>;
  samplePhotos: Record<string, SamplePhotoUpload>;
  /** The last signature sent for a scope, so a retry does not send it twice. */
  uploaded: Record<string, { key: string; fileId: string }>;
  approve: (scope: string, reviewed: string) => void;
  sign: (scope: string, reviewed: string, signature: Signature) => void;
  withdraw: (scope: string) => void;
  /** The stored signature's file id, uploading it first when needed. */
  signatureFileId: (scope: string) => Promise<string>;
  pickSamplePhoto: (scope: string) => Promise<void>;
};

export const useApproval = create<ApprovalState>((set, get) => ({
  drafts: {},
  samplePhotos: {},
  uploaded: {},
  approve: (scope, reviewed) =>
    set({ drafts: { ...get().drafts, [scope]: { method: "one_tap", reviewed, signature: null } } }),
  sign: (scope, reviewed, signature) =>
    set({ drafts: { ...get().drafts, [scope]: { method: "drawn", reviewed, signature } } }),
  withdraw: (scope) => {
    const drafts = { ...get().drafts };
    delete drafts[scope];
    set({ drafts });
  },
  signatureFileId: async (scope) => {
    const signature = get().drafts[scope]?.signature ?? null;
    if (!signature || signatureIsBlank(signature)) throw new Error("signature_missing");
    const key = signatureKey(signature);
    const held = get().uploaded[scope];
    if (held?.key === key) return held.fileId;
    const fileId = await uploadSignature(signature);
    set({ uploaded: { ...get().uploaded, [scope]: { key, fileId } } });
    return fileId;
  },
  pickSamplePhoto: async (scope) => {
    const write = (photo: SamplePhotoUpload) => set({ samplePhotos: { ...get().samplePhotos, [scope]: photo } });
    const picked = await pickImage();
    if (!picked) return;
    if ("error" in picked) {
      write({ phase: "failed", fileName: null, localUri: null, fileId: null, error: picked.error });
      return;
    }
    const { asset } = picked;
    const base = { fileName: asset.name, localUri: asset.uri, fileId: null };
    if (asset.size != null && asset.size > SAMPLE_PHOTO_MAX_MIB * 1024 * 1024) {
      write({ ...base, phase: "failed", error: `This photo is over ${SAMPLE_PHOTO_MAX_MIB} MB. Take it again at a smaller size.` });
      return;
    }
    write({ ...base, phase: "sending", error: null });
    try {
      const file = await api.uploadFile(asset, "approval_sample_photo").done;
      // A newer pick replaced this one while it was sending.
      if (get().samplePhotos[scope]?.localUri !== asset.uri) return;
      write({ ...base, phase: "stored", fileId: file.fileId, error: null });
    } catch (error) {
      if (get().samplePhotos[scope]?.localUri !== asset.uri) return;
      write({ ...base, phase: "failed", error: `${artworkErrorMessage(error)} GRIDGO takes JPEG, PNG or WebP photos.` });
    }
  },
}));

export function cartApprovalScope(cartId: string): string {
  return `cart:${cartId}`;
}

export function sampleApprovalScope(orderId: string): string {
  return `order:${orderId}`;
}

export type ApprovalStatus = "missing" | "given" | "stale";

/**
 * Whether the approval still counts for what is on screen now. A drawn
 * approval counts only with ink; one tap never counts for a drawn order.
 */
export function approvalStatus(
  draft: ApprovalDraft | undefined,
  method: ApprovalMethod,
  reviewed: string,
): ApprovalStatus {
  if (!draft) return "missing";
  if (method === "drawn" && (draft.method !== "drawn" || signatureIsBlank(draft.signature))) return "missing";
  return draft.reviewed === reviewed ? "given" : "stale";
}
