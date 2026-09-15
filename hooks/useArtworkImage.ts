import * as WebBrowser from "expo-web-browser";
import { useCallback, useEffect, useRef, useState } from "react";

import * as api from "@/lib/api";
import { isArtworkImage } from "@/lib/orderArtwork";

type Preview = { fileId: string; uri: string | null; unavailable: boolean; document: boolean };

/** Read metadata first: a PDF or Photoshop document is never sent to Image. */
export function useArtworkImage(fileId: string | null | undefined) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [openState, setOpenState] = useState<{ fileId: string; opening: boolean; error: string | null } | null>(null);
  const current = useRef(fileId);
  const openingRef = useRef<string | null>(null);

  useEffect(() => {
    current.current = fileId;
    let alive = true;
    if (!fileId) return;
    const id = fileId;
    async function load() {
      try {
        const file = await api.getFile(id);
        const image = isArtworkImage(file);
        const link = image ? await api.getFileDownloadUrl(id) : null;
        if (alive) setPreview({ fileId: id, uri: link?.url ?? null, unavailable: false, document: !image });
      } catch {
        if (alive) setPreview({ fileId: id, uri: null, unavailable: true, document: false });
      }
    }
    void load();
    return () => { alive = false; current.current = null; };
  }, [fileId, attempt]);

  const markUnrenderable = useCallback(() => {
    if (fileId) setPreview({ fileId, uri: null, unavailable: true, document: false });
  }, [fileId]);

  function retry() {
    setPreview(null);
    setOpenState(null);
    setAttempt((value) => value + 1);
  }

  async function openFile() {
    if (!fileId || openingRef.current === fileId) return;
    const id = fileId;
    openingRef.current = id;
    setOpenState({ fileId: id, opening: true, error: null });
    try {
      const link = await api.getFileDownloadUrl(id);
      if (current.current === id) await WebBrowser.openBrowserAsync(link.url);
    } catch {
      if (current.current === id) setOpenState({ fileId: id, opening: false, error: "The file could not open. Check your connection and try again." });
    } finally {
      if (openingRef.current === id) openingRef.current = null;
      if (current.current === id) setOpenState((state) => state?.fileId === id ? { ...state, opening: false } : state);
    }
  }

  const shown = preview?.fileId === fileId ? preview : null;
  return { uri: shown?.uri ?? null, unavailable: shown?.unavailable ?? false, document: shown?.document ?? false,
    markUnrenderable, retry, openFile, opening: openState !== null && openState.fileId === fileId && openState.opening,
    openError: openState !== null && openState.fileId === fileId ? openState.error : null };
}
