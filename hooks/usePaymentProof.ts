import { useCallback, useRef, useState } from "react";

import * as api from "@/lib/api";
import { artworkErrorMessage, normalizeFileName } from "@/lib/artworkUpload";
import { PROOF_ACCEPTED, PROOF_MAX_MIB, PROOF_MIME_TYPES } from "@/lib/checkout";
import { FILE_PICKER_NEEDS_REBUILD, getDocumentPickerNative } from "@/lib/nativeModules";

export type PaymentProofState = {
  phase: "empty" | "sending" | "stored" | "failed";
  fileName: string;
  fileId: string | null;
  progress: number | null;
  error: string | null;
};

const EMPTY: PaymentProofState = {
  phase: "empty",
  fileName: "",
  fileId: null,
  progress: null,
  error: null,
};

/**
 * The screenshot of the QR payment.
 *
 * GRIDGO does not take the money — the client pays from their own wallet and
 * hands over the receipt and its reference, and Operations matches both against
 * the GRIDGO wallet by hand. Checkout will not accept the order without the
 * screenshot, so it is uploaded here, ahead of the button, and the reference is
 * typed beside it.
 *
 * Its own hook rather than the artwork one: the purpose is `payment_proof`,
 * which the storage API limits to images and to a much smaller file than a
 * print-ready artwork. Sharing the artwork hook would have meant one set of
 * limits quietly applying to both.
 */
export function usePaymentProof() {
  const [state, setState] = useState<PaymentProofState>(EMPTY);
  const handleRef = useRef<api.UploadHandle | null>(null);

  const pick = useCallback(async () => {
    const DocumentPicker = getDocumentPickerNative();
    if (!DocumentPicker) {
      setState({
        ...EMPTY,
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
      setState({
        ...EMPTY,
        phase: "failed",
        error: "The picker did not open. Try again, and check GRIDGO has access to your photos.",
      });
      return;
    }
    if (result.canceled) return;

    const asset = result.assets?.[0];
    if (!asset?.uri) {
      setState({
        ...EMPTY,
        phase: "failed",
        error: "That file could not be read. Take the screenshot again, or pick it from Photos.",
      });
      return;
    }

    const fileName = normalizeFileName(asset.name);
    // Said before the bytes move, in the client's own terms.
    if (typeof asset.size === "number" && asset.size > PROOF_MAX_MIB * 1024 * 1024) {
      setState({
        ...EMPTY,
        phase: "failed",
        fileName,
        error: `A receipt screenshot has to be under ${PROOF_MAX_MIB} MB. Send the screenshot rather than the whole photo.`,
      });
      return;
    }

    setState({ phase: "sending", fileName, fileId: null, progress: 0, error: null });
    const handle = api.uploadFile(
      { uri: asset.uri, name: fileName, mimeType: asset.mimeType ?? null },
      "payment_proof",
      (fraction) =>
        setState((prev) => (prev.phase === "sending" ? { ...prev, progress: fraction } : prev)),
    );
    handleRef.current = handle;

    try {
      const file = await handle.done;
      setState({
        phase: "stored",
        fileName: file.originalFilename || fileName,
        fileId: file.fileId,
        progress: 1,
        error: null,
      });
    } catch (error) {
      setState({
        ...EMPTY,
        phase: "failed",
        fileName,
        // The storage contract's own words, plus what this purpose accepts.
        error: `${artworkErrorMessage(error)} GRIDGO takes ${PROOF_ACCEPTED} for a receipt.`,
      });
    } finally {
      handleRef.current = null;
    }
  }, []);

  const reset = useCallback(() => {
    handleRef.current?.cancel();
    handleRef.current = null;
    setState(EMPTY);
  }, []);

  return { state, pick, reset };
}
