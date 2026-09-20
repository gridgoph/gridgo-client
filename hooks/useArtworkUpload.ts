import { useCallback, useEffect, useRef, useState } from "react";

import * as api from "@/lib/api";
import {
  ARTWORK_ACCEPTED,
  ARTWORK_MAX_BYTES,
  ARTWORK_MAX_MIB,
  EMPTY_ARTWORK,
  artworkErrorMessage,
  normalizeFileName,
  type ArtworkUploadState,
} from "@/lib/artworkUpload";
import { FILE_PICKER_NEEDS_REBUILD, getDocumentPickerNative } from "@/lib/nativeModules";

/**
 * Owns one artwork upload, from picking a file to the server confirming it.
 *
 * The same loop serves a brand-new request and a QA correction, so a rejected
 * file is replaced exactly the way it was chosen the first time.
 *
 * Nothing here reports success early. `stored` is only ever reached from a
 * `201` carrying a file id; a progress bar at 100% moves to `saving`.
 */

/** Picker filter. PDFs plus any image — the server judges the real format. */
const PICKER_TYPES = ["application/pdf", "image/*"];

/**
 * Narrowing the picker to one shop's listing.
 *
 * A shop says which artwork types its listing takes, and a client who picks a
 * PDF for a shop that prints from images only should find that out in the
 * picker, not after a 200 MB upload. `accept` is those MIME types; `check`
 * answers whether a chosen file is one of them, and `rejection` is the shop's
 * own words for what to send instead.
 */
export type FormatGuard = {
  accept: string[];
  check: (fileName: string, mimeType?: string | null) => boolean;
  rejection: (fileName: string) => string;
};

export type ArtworkUploadController = {
  state: ArtworkUploadState;
  /** Open the file picker and upload whatever is chosen. */
  pick: () => Promise<void>;
  /** Send the same file again after a failure. */
  retry: () => Promise<void>;
  /** Abandon an in-flight transfer. */
  cancel: () => void;
  /** Bind a stored file to an order. Returns the updated order. */
  attachTo: (orderId: string) => Promise<api.Order>;
  /** Forget everything, e.g. after the request is sent. */
  reset: () => void;
  /** Adopt a file the order already holds, without re-uploading. */
  adopt: (fileId: string, fileName: string) => void;
};

export function useArtworkUpload(
  initial?: {
    fileId?: string | null;
    fileName?: string | null;
  },
  guard?: FormatGuard,
): ArtworkUploadController {
  const [state, setState] = useState<ArtworkUploadState>(() =>
    initial?.fileId
      ? {
          ...EMPTY_ARTWORK,
          phase: "stored",
          fileId: initial.fileId,
          fileName: normalizeFileName(initial.fileName),
        }
      : EMPTY_ARTWORK,
  );

  const handleRef = useRef<api.UploadHandle | null>(null);
  const lastAssetRef = useRef<api.UploadAsset | null>(null);
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      handleRef.current?.cancel();
    };
  }, []);

  const send = useCallback(async (asset: api.UploadAsset) => {
    lastAssetRef.current = asset;
    setState({
      ...EMPTY_ARTWORK,
      phase: "sending",
      fileName: asset.name,
      progress: 0,
    });

    const handle = api.uploadFile(asset, "artwork", (fraction) => {
      if (!aliveRef.current) return;
      setState((prev) => {
        if (prev.phase !== "sending") return prev;
        // Bytes delivered is not storage confirmed — hold at "saving" until
        // the server answers.
        if (fraction != null && fraction >= 1) {
          return { ...prev, phase: "saving", progress: 1 };
        }
        return { ...prev, progress: fraction };
      });
    });
    handleRef.current = handle;

    try {
      const file = await handle.done;
      if (!aliveRef.current) return;
      setState({
        phase: "stored",
        fileName: file.originalFilename || asset.name,
        fileId: file.fileId,
        progress: 1,
        size: file.size,
        contentType: file.detectedContentType,
        detected: file.detected ?? null,
        error: null,
      });
    } catch (error) {
      if (!aliveRef.current) return;
      const cancelled =
        error instanceof api.ApiError &&
        (error.body as { error?: string } | null)?.error === "upload_cancelled";
      if (cancelled) {
        setState(EMPTY_ARTWORK);
        return;
      }
      setState({
        ...EMPTY_ARTWORK,
        phase: "failed",
        fileName: asset.name,
        error: artworkErrorMessage(error),
      });
    } finally {
      handleRef.current = null;
    }
  }, []);

  const pick = useCallback(async () => {
    const DocumentPicker = getDocumentPickerNative();
    if (!DocumentPicker) {
      setState((prev) => ({
        ...prev,
        phase: "failed",
        error: FILE_PICKER_NEEDS_REBUILD,
      }));
      return;
    }
    let result: Awaited<ReturnType<typeof DocumentPicker.getDocumentAsync>>;
    try {
      result = await DocumentPicker.getDocumentAsync({
        // A listing's own formats when there is one; otherwise everything the
        // storage API can sniff, and the server decides.
        type: guard?.accept.length ? guard.accept : PICKER_TYPES,
        multiple: false,
        // Gives a URI the uploader can stream from on both platforms. The
        // bytes are copied on disk, never read into JavaScript.
        copyToCacheDirectory: true,
      });
    } catch {
      setState((prev) => ({
        ...prev,
        phase: "failed",
        error: "The file picker did not open. Try again, and check GRIDGO has access to your files.",
      }));
      return;
    }

    if (result.canceled) return;
    const asset = result.assets?.[0];
    if (!asset?.uri) {
      setState({
        ...EMPTY_ARTWORK,
        phase: "failed",
        error: "That file could not be read. Pick it again, or copy it into Files first.",
      });
      return;
    }

    // Some pickers ignore the type filter, so the choice is checked here too.
    // Said before the bytes move, in the shop's own terms.
    const chosenName = normalizeFileName(asset.name);
    if (guard && !guard.check(chosenName, asset.mimeType ?? null)) {
      setState({
        ...EMPTY_ARTWORK,
        phase: "failed",
        fileName: chosenName,
        error: guard.rejection(chosenName),
      });
      return;
    }

    // Say the limit before spending a client's data on a doomed upload.
    if (typeof asset.size === "number" && asset.size > ARTWORK_MAX_BYTES) {
      setState({
        ...EMPTY_ARTWORK,
        phase: "failed",
        fileName: chosenName,
        error: `Artwork has to be under ${ARTWORK_MAX_MIB} MB, and this file is larger. Flatten the layers or export at a lower resolution, then pick it again.`,
      });
      return;
    }

    await send({
      uri: asset.uri,
      name: chosenName,
      mimeType: asset.mimeType ?? null,
      file: "file" in asset ? (asset as { file?: Blob }).file : undefined,
    });
  }, [send, guard]);

  const retry = useCallback(async () => {
    const asset = lastAssetRef.current;
    if (!asset) {
      await pick();
      return;
    }
    await send(asset);
  }, [pick, send]);

  const cancel = useCallback(() => {
    handleRef.current?.cancel();
    handleRef.current = null;
  }, []);

  const attachTo = useCallback(
    async (orderId: string) => {
      const fileId = state.fileId;
      if (!fileId) {
        throw new Error(`Upload your artwork first. Accepted formats are ${ARTWORK_ACCEPTED}.`);
      }
      setState((prev) => ({ ...prev, phase: "attaching", error: null }));
      try {
        const { order, file } = await api.attachFileToOrder(fileId, orderId);
        if (aliveRef.current) {
          setState((prev) => ({
            ...prev,
            phase: "attached",
            fileName: file.originalFilename || prev.fileName,
            error: null,
          }));
        }
        return order;
      } catch (error) {
        if (aliveRef.current) {
          setState((prev) => ({
            ...prev,
            phase: "failed",
            error: artworkErrorMessage(error),
          }));
        }
        throw error;
      }
    },
    [state.fileId],
  );

  const reset = useCallback(() => {
    handleRef.current?.cancel();
    handleRef.current = null;
    lastAssetRef.current = null;
    setState(EMPTY_ARTWORK);
  }, []);

  const adopt = useCallback((fileId: string, fileName: string) => {
    lastAssetRef.current = null;
    setState({
      ...EMPTY_ARTWORK,
      phase: "stored",
      fileId,
      fileName: normalizeFileName(fileName),
    });
  }, []);

  return { state, pick, retry, cancel, attachTo, reset, adopt };
}
