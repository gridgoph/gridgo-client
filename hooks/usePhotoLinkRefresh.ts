import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { AppState } from "react-native";

import type { CatalogItem } from "@/lib/api";
import { earliestPhotoExpiry, hasStalePhotoLink, heldReadIsStale } from "@/lib/photoLinks";

type Listings = readonly (Pick<CatalogItem, "photos"> | null | undefined)[];

/**
 * Keeps the signed photo links a screen holds from outliving their signature.
 *
 * `listings` is what the screen is drawing now (null while nothing is held).
 * `reread` is the screen's own forced re-read of the same thing; it puts the
 * answer in state as usual and also returns the listings it just read, so this
 * hook can see what the server minted without waiting for a render.
 *
 * Two things ask for a re-read:
 *
 * - **Coming back to the app.** Resuming is not a focus change, so a screen
 *   that re-reads on focus still draws the links it held when the phone went
 *   to sleep. On `AppState` → `active`, a held read older than four minutes, or
 *   one whose soonest link is stale, is read again.
 * - **A tile that failed on an old link.** The returned `onStale` goes to
 *   `SamplePhoto`, which calls it instead of latching "This photo will not
 *   load" when its link is past `downloadUrlExpiresAt`.
 *
 * Every caller shares one re-read at a time: a Home strip of three expired
 * tiles is one board read, not three.
 *
 * A phone whose clock runs ahead of the server's sees every link as already
 * expired, fresh ones included — and re-reading on that would never stop. So
 * when a re-read hands back links that are stale on arrival, the phone's clock
 * is what is wrong, and expiry stops being a reason to re-read until a read
 * comes back that the clock agrees with. The age of the read still counts:
 * that is measured on the phone's own clock at both ends.
 */
export function usePhotoLinkRefresh(
  listings: Listings | null,
  reread: () => Promise<Listings | null>,
): () => Promise<void> {
  const latest = useRef({ listings, reread });
  useLayoutEffect(() => {
    latest.current = { listings, reread };
  }, [listings, reread]);

  // When the listings on screen arrived, by the phone's clock.
  const readAt = useRef<number | null>(null);
  useEffect(() => {
    readAt.current = listings ? Date.now() : null;
  }, [listings]);

  const inflight = useRef<Promise<void> | null>(null);
  const clockSkewed = useRef(false);

  const run = useCallback((): Promise<void> => {
    if (inflight.current) return inflight.current;
    const next = Promise.resolve()
      .then(() => latest.current.reread())
      .then(
        (fresh) => {
          if (fresh) clockSkewed.current = hasStalePhotoLink(fresh);
        },
        () => {
          /* The screen owns its error; the tile says what it could not load. */
        },
      )
      .finally(() => {
        if (inflight.current === next) inflight.current = null;
      });
    inflight.current = next;
    return next;
  }, []);

  const onStale = useCallback((): Promise<void> => {
    if (clockSkewed.current) return Promise.resolve();
    return run();
  }, [run]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") return;
      const held = latest.current.listings;
      if (!held) return;
      const stale = heldReadIsStale({
        readAt: readAt.current,
        earliestExpiry: clockSkewed.current ? null : earliestPhotoExpiry(held),
      });
      if (stale) void run();
    });
    return () => subscription.remove();
  }, [run]);

  return onStale;
}
