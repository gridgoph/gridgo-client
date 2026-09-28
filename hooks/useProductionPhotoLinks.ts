import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { usePhotoLinkRefresh } from "@/hooks/usePhotoLinkRefresh";
import * as api from "@/lib/api";
import type { ProductionPhoto } from "@/lib/api";
import { photoLinkExpiry } from "@/lib/photoLinks";

type Signed = { url: string; expiresAt: string | null };

export type ProgressPhotoLink = {
  fileId: string;
  at?: string;
  /** undefined while a link is being asked for, null when none could be had. */
  url: string | null | undefined;
  expiresAt: string | null;
};

/**
 * Signed links for an order's progress photos, kept alive.
 *
 * The order payload signs each photo for a few minutes. Two things go wrong
 * with that, and both are answered photo by photo through
 * `GET /files/:fileId/download-url` rather than by re-reading the whole order:
 *
 * - **Missing.** Storage could not sign a photo when the order was read. The
 *   photo still exists, so a link is asked for once on sight.
 * - **Expired.** The screen was left open or the app was backgrounded past the
 *   signature. `usePhotoLinkRefresh` (the same rule the catalogue photos use,
 *   gridgo-client#116) re-signs on resume and when a tile fails on an old link.
 *
 * Whichever link expires later wins, so a live refresh of the order that
 * brings newer links replaces ours, and ours never replaces a newer one.
 */
export function useProductionPhotoLinks(photos: readonly ProductionPhoto[]): {
  links: ProgressPhotoLink[];
  onStale: () => Promise<void>;
} {
  const [signed, setSigned] = useState<Record<string, Signed | "failed">>({});
  const asked = useRef(new Set<string>());

  const links = useMemo(
    () => photos.map((photo) => linkFor(photo, signed[photo.fileId])),
    [photos, signed],
  );

  // A photo the order could not sign: ask once, and say so if that fails too.
  useEffect(() => {
    for (const photo of photos) {
      if (photo.downloadUrl || asked.current.has(photo.fileId)) continue;
      asked.current.add(photo.fileId);
      api.getFileDownloadUrl(photo.fileId).then(
        (link) => setSigned((held) => ({ ...held, [photo.fileId]: toSigned(link) })),
        () => setSigned((held) => (held[photo.fileId] ? held : { ...held, [photo.fileId]: "failed" })),
      );
    }
  }, [photos]);

  const reread = useCallback(async () => {
    const results = await Promise.all(
      photos.map((photo) =>
        api.getFileDownloadUrl(photo.fileId).then(
          (link) => [photo.fileId, toSigned(link)] as const,
          () => null,
        ),
      ),
    );
    const fresh = Object.fromEntries(results.filter((entry) => entry !== null));
    setSigned((held) => ({ ...held, ...fresh }));
    return [
      {
        photos: photos.map((photo) => {
          const link = linkFor(photo, fresh[photo.fileId]);
          return { downloadUrlExpiresAt: link.expiresAt };
        }),
      },
    ];
  }, [photos]);

  const holder = useMemo(
    () =>
      photos.length
        ? [{ photos: links.map((link) => ({ downloadUrlExpiresAt: link.expiresAt })) }]
        : null,
    [photos.length, links],
  );
  const onStale = usePhotoLinkRefresh(holder, reread);

  return { links, onStale };
}

function toSigned(link: { url: string; expiresAt?: string | null }): Signed {
  return { url: link.url, expiresAt: link.expiresAt ?? null };
}

function linkFor(photo: ProductionPhoto, held: Signed | "failed" | undefined): ProgressPhotoLink {
  const fromOrder: Signed | null = photo.downloadUrl
    ? { url: photo.downloadUrl, expiresAt: photo.downloadUrlExpiresAt ?? null }
    : null;
  const ours = held && held !== "failed" ? held : null;
  const best =
    fromOrder && ours
      ? (photoLinkExpiry({ downloadUrlExpiresAt: ours.expiresAt }) ?? 0) >
        (photoLinkExpiry({ downloadUrlExpiresAt: fromOrder.expiresAt }) ?? 0)
        ? ours
        : fromOrder
      : (fromOrder ?? ours);

  return {
    fileId: photo.fileId,
    at: photo.at,
    url: best ? best.url : held === "failed" ? null : undefined,
    expiresAt: best?.expiresAt ?? null,
  };
}
