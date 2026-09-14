import { useCallback, useEffect, useRef } from "react";

import * as api from "@/lib/api";
import { artworkErrorMessage, normalizeFileName } from "@/lib/artworkUpload";
import { PROOF_ACCEPTED, PROOF_MAX_MIB, PROOF_MIME_TYPES } from "@/lib/checkout";
import { FILE_PICKER_NEEDS_REBUILD, getDocumentPickerNative } from "@/lib/nativeModules";
import { liveGeneration } from "@/lib/live";
import { referenceFromOcr } from "@/lib/receiptOcr";
import { recognizeReceiptFromUri } from "@/lib/receiptOcrRecognize";
import {
  EMPTY_PROOF,
  useCheckoutPayment,
  type PaymentProofState,
} from "@/store/checkoutPayment";

export type { PaymentProofState };

/**
 * The screenshot of the QR payment.
 *
 * GRIDGO does not take the money — the client pays from their own wallet and
 * hands over the receipt and its reference, and Operations matches both against
 * the GRIDGO wallet by hand. Checkout will not accept the order without the
 * screenshot, so it is uploaded here, ahead of the button, and the reference is
 * typed beside it.
 *
 * State lives in `useCheckoutPayment` so leaving checkout to set an address
 * does not throw the screenshot and the reference away.
 */
export function usePaymentProof(cartId: string | null) {
  const proof = useCheckoutPayment((state) => state.proof);
  const ocr = useCheckoutPayment((state) => state.ocr);
  const bind = useCheckoutPayment((state) => state.bind);
  const setProof = useCheckoutPayment((state) => state.setProof);
  const setOcr = useCheckoutPayment((state) => state.setOcr);
  const handleRef = useRef<api.UploadHandle | null>(null);

  useEffect(() => {
    bind(cartId);
  }, [bind, cartId]);

  const readReference = useCallback(
    (uri: string, isCurrent: () => boolean) => {
      setOcr({ status: "reading", reference: null });
      void (async () => {
        try {
          const raw = await recognizeReceiptFromUri(uri, isCurrent);
          if (!isCurrent()) return;
          const reference = referenceFromOcr(raw);
          setOcr(
            reference
              ? { status: "filled", reference }
              : { status: "unreadable", reference: null },
          );
          if (reference) useCheckoutPayment.getState().applyOcrReference(reference);
        } catch {
          if (!isCurrent()) return;
          setOcr({ status: "unreadable", reference: null });
        }
      })();
    },
    [setOcr],
  );

  const pick = useCallback(async () => {
    const owner = liveGeneration();
    let generation = useCheckoutPayment.getState().generation;
    const isCurrent = () => {
      const state = useCheckoutPayment.getState();
      return state.cartId === cartId && state.generation === generation && liveGeneration() === owner;
    };
    if (!cartId || !isCurrent()) return;
    const beginProof = () => {
      generation = useCheckoutPayment.getState().beginProof();
      handleRef.current?.cancel();
      handleRef.current = null;
    };
    const DocumentPicker = getDocumentPickerNative();
    if (!DocumentPicker) {
      beginProof();
      setProof({
        ...EMPTY_PROOF,
        phase: "failed",
        error: FILE_PICKER_NEEDS_REBUILD,
      });
      return;
    }
    let result: Awaited<ReturnType<typeof DocumentPicker.getDocumentAsync>>;
    try {
      result = await DocumentPicker.getDocumentAsync({
        type: PROOF_MIME_TYPES,
        multiple: false,
        copyToCacheDirectory: true,
      });
    } catch {
      if (!isCurrent()) return;
      beginProof();
      setProof({
        ...EMPTY_PROOF,
        phase: "failed",
        error: "The picker did not open. Try again, and check GRIDGO has access to your photos.",
      });
      return;
    }
    if (!isCurrent() || result.canceled) return;
    beginProof();

    const asset = result.assets?.[0];
    if (!asset?.uri) {
      setProof({
        ...EMPTY_PROOF,
        phase: "failed",
        error: "That file could not be read. Take the screenshot again, or pick it from Photos.",
      });
      return;
    }

    const fileName = normalizeFileName(asset.name);
    if (typeof asset.size === "number" && asset.size > PROOF_MAX_MIB * 1024 * 1024) {
      setProof({
        ...EMPTY_PROOF,
        phase: "failed",
        fileName,
        error: `A receipt screenshot has to be under ${PROOF_MAX_MIB} MB. Send the screenshot rather than the whole photo.`,
      });
      return;
    }

    setProof({
      phase: "sending",
      fileName,
      fileId: null,
      localUri: asset.uri,
      progress: 0,
      error: null,
    });
    readReference(asset.uri, isCurrent);
    const handle = api.uploadFile(
      { uri: asset.uri, name: fileName, mimeType: asset.mimeType ?? null },
      "payment_proof",
      (fraction) => {
        if (isCurrent()) setProof((prev) => (prev.phase === "sending" ? { ...prev, progress: fraction } : prev));
      },
    );
    handleRef.current = handle;

    try {
      const file = await handle.done;
      if (!isCurrent()) return;
      setProof({
        phase: "stored",
        fileName: file.originalFilename || fileName,
        fileId: file.fileId,
        localUri: asset.uri,
        progress: 1,
        error: null,
      });
    } catch (error) {
      if (!isCurrent()) return;
      setProof({
        ...EMPTY_PROOF,
        phase: "failed",
        fileName,
        localUri: asset.uri,
        error: `${artworkErrorMessage(error)} GRIDGO takes ${PROOF_ACCEPTED} for a receipt.`,
      });
    } finally {
      if (handleRef.current === handle) handleRef.current = null;
    }
  }, [cartId, readReference, setProof]);

  const reset = useCallback(() => {
    const state = useCheckoutPayment.getState();
    if (state.cartId !== cartId) return;
    state.beginProof();
    state.setReference("");
    handleRef.current?.cancel();
    handleRef.current = null;
  }, [cartId]);

  return { state: proof, ocr, pick, reset };
}
