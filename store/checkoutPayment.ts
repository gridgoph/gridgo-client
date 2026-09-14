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
  proof: EMPTY_PROOF,
  ocr: OCR_IDLE,
  reference: "",

  bind: (cartId) => {
    if (get().cartId === cartId) return;
    set({
      cartId,
      proof: EMPTY_PROOF,
      ocr: OCR_IDLE,
      reference: "",
    });
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
      proof: EMPTY_PROOF,
      ocr: OCR_IDLE,
      reference: "",
    }),
}));
