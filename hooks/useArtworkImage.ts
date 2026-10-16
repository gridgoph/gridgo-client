import * as WebBrowser from "expo-web-browser";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { usePhotoLinkRefresh } from "@/hooks/usePhotoLinkRefresh";
import * as api from "@/lib/api";
import type { StoredFile } from "@/lib/api";
import {
  artworkPreviewFailure,
  artworkPreviewPlan,
  isWordPreviewRefusal,
  WORD_PREVIEW_UNAVAILABLE,
  type ArtworkPreviewFailure,
  type ArtworkPreviewPlan,
} from "@/lib/artworkPreview";
import { photoLinkIsStale } from "@/lib/photoLinks";

/** What the file's face shows. */
export type ArtworkView =
  | { kind: "loading" }
  /** `page` is 1 when the picture is GRIDGO's rendering of a document's first page. */
  | { kind: "image"; uri: string; expiresAt: string | null; page: number | null }
  | { kind: "word"; message: string }
  | { kind: "document" }
  | { kind: "failed"; failure: ArtworkPreviewFailure };

type Held = { fileId: string; file: StoredFile | null; plan: ArtworkPreviewPlan | null; view: ArtworkView };
type Signed = { url: string; expiresAt?: string | null; contentType?: string };

const LOADING: ArtworkView = { kind: "loading" };

function imageView(file: StoredFile, link: Signed): ArtworkView {
  const page = artworkPreviewPlan(file) === "preview" && link.contentType === "image/png" && file.detectedContentType === "application/pdf" ? 1 : null;
  return { kind: "image", uri: link.url, expiresAt: link.expiresAt ?? null, page };
}

/** Sign the picture for a file whose plan has one. `retry` asks GRIDGO to render it again. */
function sign(file: StoredFile, plan: ArtworkPreviewPlan, retry: boolean): Promise<Signed> {
  if (plan === "preview") {
    return retry
      ? api.retryFilePreview(file.fileId, file.preview?.retryPath)
      : api.getFilePreviewUrl(file.fileId, file.preview?.downloadUrlPath);
  }
  return api.getFileDownloadUrl(file.fileId);
}

/**
 * The picture of a stored file, read safely.
 *
 * Metadata comes first, so a PDF or a Word file is never handed to `Image` as
 * its original bytes. Artwork that GRIDGO previews (gridgo-api#232) is drawn
 * from its signed preview — page 1 of a PDF — and every other image from its
 * signed original. A Word file draws nothing and says why. A failure is held
 * with its reason and a Retry that GRIDGO will accept: the retry route renders
 * again, and a 429/503 holds the button for the wait the API asked for.
 *
 * A signed link lives minutes. The same refresh rule as the catalogue photos
 * (`usePhotoLinkRefresh`, gridgo-client#116) re-signs it on resume, and a
 * picture that fails on an old link is re-signed rather than called broken.
 * A picture that fails on a good link is reported to GRIDGO, which otherwise
 * never sees a direct storage read go wrong.
 */
export function useArtworkImage(fileId: string | null | undefined) {
  const [held, setHeld] = useState<Held | null>(null);
  const [run, setRun] = useState({ attempt: 0, retry: false });
  const [blocked, setBlocked] = useState<{ fileId: string; until: number } | null>(null);
  const [openState, setOpenState] = useState<{ fileId: string; opening: boolean; error: string | null } | null>(null);
  const current = useRef(fileId);
  const openingRef = useRef<string | null>(null);
  const reported = useRef(new Set<string>());

  useEffect(() => {
    current.current = fileId;
    let alive = true;
    if (!fileId) return;
    const id = fileId;
    const retry = run.retry;
    async function load() {
      let file: StoredFile | null = null;
      let plan: ArtworkPreviewPlan | null = null;
      try {
        file = await api.getFile(id);
        plan = artworkPreviewPlan(file);
        if (plan === "word" || plan === "document") {
          const view: ArtworkView = plan === "word" ? { kind: "word", message: WORD_PREVIEW_UNAVAILABLE } : { kind: "document" };
          if (alive) setHeld({ fileId: id, file, plan, view });
          return;
        }
        const link = await sign(file, plan, retry);
        if (alive) setHeld({ fileId: id, file, plan, view: imageView(file, link) });
      } catch (error) {
        if (!alive) return;
        if (isWordPreviewRefusal(error)) {
          const body = (error as api.ApiError).body as { message?: unknown } | null;
          const message = typeof body?.message === "string" ? body.message : WORD_PREVIEW_UNAVAILABLE;
          setHeld({ fileId: id, file, plan: "word", view: { kind: "word", message } });
          return;
        }
        const failure = artworkPreviewFailure(error);
        setHeld({ fileId: id, file, plan, view: { kind: "failed", failure } });
        if (failure.retryAfterMs > 0) setBlocked({ fileId: id, until: Date.now() + failure.retryAfterMs });
      }
    }
    void load();
    return () => { alive = false; current.current = null; };
  }, [fileId, run]);

  // Lift the Retry hold once the wait GRIDGO asked for has passed.
  useEffect(() => {
    if (!blocked) return;
    const timer = setTimeout(() => setBlocked(null), Math.max(0, blocked.until - Date.now()));
    return () => clearTimeout(timer);
  }, [blocked]);

  const shown = held?.fileId === fileId ? held : null;
  const view = shown?.view ?? LOADING;

  const reread = useCallback(async () => {
    const at = held;
    if (!at?.file || !at.plan || at.view.kind !== "image") return null;
    const file = at.file;
    const link = await sign(file, at.plan, false);
    if (current.current !== at.fileId) return null;
    const next = imageView(file, link);
    setHeld((value) => value?.fileId === at.fileId ? { ...value, view: next } : value);
    return [{ photos: [{ downloadUrlExpiresAt: link.expiresAt ?? null }] }];
  }, [held]);

  const expiresAt = view.kind === "image" ? view.expiresAt : null;
  const holder = useMemo(
    () => (view.kind === "image" ? [{ photos: [{ downloadUrlExpiresAt: expiresAt }] }] : null),
    [view.kind, expiresAt],
  );
  const onStale = usePhotoLinkRefresh(holder, reread);

  /** `Image` could not draw the link it was given. */
  const markUnrenderable = useCallback(() => {
    if (!shown || shown.view.kind !== "image") return;
    const { fileId: id, plan, view: failedView } = shown;
    if (photoLinkIsStale({ downloadUrlExpiresAt: failedView.expiresAt })) {
      void onStale();
      return;
    }
    setHeld((value) => value?.fileId === id
      ? { ...value, view: { kind: "failed", failure: artworkPreviewFailure("image_load_failed") } }
      : value);
    if (plan === "preview" && !reported.current.has(failedView.uri)) {
      reported.current.add(failedView.uri);
      api.reportFilePreviewFailure(id, "image_load_failed").catch(() => {
        /* The report is best effort; the card already says what failed. */
      });
    }
  }, [shown, onStale]);

  function retry() {
    // A preview GRIDGO renders is retried through its retry route; anything
    // else (a failed metadata read included) simply reads again.
    const viaRetryRoute = shown?.plan === "preview" && Boolean(shown.file);
    setHeld(null);
    setOpenState(null);
    setRun((value) => ({ attempt: value.attempt + 1, retry: viaRetryRoute }));
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

  return {
    view,
    file: shown?.file ?? null,
    uri: view.kind === "image" ? view.uri : null,
    unavailable: view.kind === "failed",
    document: view.kind === "document" || view.kind === "word",
    contentType: shown?.file?.detectedContentType ?? null,
    /** True while GRIDGO has asked the phone to wait before another Retry. */
    retryBlocked: blocked !== null && blocked.fileId === fileId,
    markUnrenderable,
    retry,
    openFile,
    opening: openState !== null && openState.fileId === fileId && openState.opening,
    openError: openState !== null && openState.fileId === fileId ? openState.error : null,
  };
}
