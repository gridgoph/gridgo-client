import { useCallback, useEffect, useState } from "react";

import * as api from "@/lib/api";

/**
 * A short-lived, authorized URL for reading one stored artwork file.
 *
 * The URL is a capability, not identity: it is held in memory for as long as
 * the screen is open and never written to a store or a log. A PDF cannot be
 * shown as an image, so a load failure is reported rather than retried — the
 * preview falls back to naming the file.
 */
export function useArtworkImage(fileId: string | null | undefined) {
  const [uri, setUri] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    let alive = true;
    setUri(null);
    setUnavailable(false);
    if (!fileId) return;

    api
      .getFileDownloadUrl(fileId)
      .then((result) => {
        if (alive) setUri(result.url);
      })
      .catch(() => {
        if (alive) setUnavailable(true);
      });

    return () => {
      alive = false;
    };
  }, [fileId]);

  /** Called when the image itself will not decode — a PDF, or an expired URL. */
  const markUnrenderable = useCallback(() => {
    setUri(null);
    setUnavailable(true);
  }, []);

  return { uri, unavailable, markUnrenderable };
}
