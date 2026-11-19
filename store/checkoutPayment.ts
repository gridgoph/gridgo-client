import { create } from "zustand";

import { OCR_IDLE, type ReceiptOcrState } from "@/lib/receiptOcr";

export type PaymentProofState = {
  phase: "empty" | "sending" | "stored" | "failed";
  fileName: string;
  fileId: string | null;
  localUri: string | null;
  progress: number | null;
  error: string | null;
};

export const EMPTY_PROOF: PaymentProofState = {
  phase: "empty",
  fileName: "",
  fileId: null,
  localUri: null,
  progress: null,
  error: null,
};

type CheckoutPaymentState = {
  method: "qr_manual" | "cash";
  chooseMethod: (method: "qr_manual" | "cash") => void;
  cartId: string | null;
  generation: number;
  autofilledReference: string | null;
  beginProof: () => number;
  applyOcrReference: (reference: string) => void;
  proof: PaymentProofState;
  ocr: ReceiptOcrState;
  reference: string;
  bind: (cartId: string | null) => void;
  setProof: (
    next: PaymentProofState | ((prev: PaymentProofState) => PaymentProofState),
  ) => void;
  setOcr: (next: ReceiptOcrState) => void;
  setReference: (next: string) => void;
  reset: () => void;
};

/**
 * Checkout's receipt and reference, kept outside the screen.
 *
 * Address navigation must not discard a receipt already uploaded. Draft
 * lifetime and replacement rules: `docs/RECEIPT_OCR_VALIDATION.md#draft-ownership`.
 */
export const createPaymentDraft = () => create<CheckoutPaymentState>((set, get) => ({
  method: "qr_manual",
  chooseMethod: (method) => set({ method }),
  cartId: null,
  generation: 0,
  autofilledReference: null,
  proof: EMPTY_PROOF,
  ocr: OCR_IDLE,
  reference: "",

  bind: (cartId) => {
    if (get().cartId === cartId) return;
    set({
      cartId,
      method: "qr_manual",
      generation: get().generation + 1,
      autofilledReference: null,
      proof: EMPTY_PROOF,
      ocr: OCR_IDLE,
      reference: "",
    });
  },

  beginProof: () => {
    const state = get();
    const generation = state.generation + 1;
    set({
      generation,
      proof: EMPTY_PROOF,
      ocr: OCR_IDLE,
      reference: state.reference === state.autofilledReference ? "" : state.reference,
      autofilledReference: null,
    });
    return generation;
  },

  applyOcrReference: (reference) => {
    const state = get();
    if (state.reference.trim() && state.reference !== state.autofilledReference) return;
    set({ reference, autofilledReference: reference });
  },

  setProof: (next) =>
    set((state) => ({
      proof: typeof next === "function" ? next(state.proof) : next,
    })),

  setOcr: (ocr) => set({ ocr }),

  setReference: (reference) => set({ reference }),

  reset: () =>
    set({
      cartId: null,
      method: "qr_manual",
      generation: get().generation + 1,
      autofilledReference: null,
      proof: EMPTY_PROOF,
      ocr: OCR_IDLE,
      reference: "",
    }),
}));

/** Checkout and order payments never replace each other's in-memory draft. */
export const useCheckoutPayment = createPaymentDraft();
export const useOrderPayment = createPaymentDraft();
/** A higher-fee delivery pin's one surcharge transfer. */
export const usePinPayment = createPaymentDraft();
/** Cash no-show debt proof has its own owner and upload purpose. */
export const useCashPayment = createPaymentDraft();
/** An approved order change's QR top-up (report F9FCD485). */
export const useChangePayment = createPaymentDraft();

export type PaymentDraftStore = typeof useCheckoutPayment;
/** Express Pay's receipt; bound once, so a recreated draft keeps the screenshot. */
export const useExpressPayment = createPaymentDraft();
