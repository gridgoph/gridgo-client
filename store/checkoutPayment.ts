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
 * Setting a delivery address pushes `/request/where` and unmounts checkout.
 * React state on the screen died with it, which emptied a screenshot already
 * sent. This store is the basket's payment draft for as long as this cart id
 * is the one on the phone.
 */
export const useCheckoutPayment = create<CheckoutPaymentState>((set, get) => ({
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
      generation: get().generation + 1,
      autofilledReference: null,
      proof: EMPTY_PROOF,
      ocr: OCR_IDLE,
      reference: "",
    }),
}));
