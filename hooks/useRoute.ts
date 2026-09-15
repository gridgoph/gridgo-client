import { useEffect, useRef, useState } from "react";

import { fetchRoute, type RouteResult } from "@/lib/osrm";
import { isGeoPoint, type GeoPoint } from "@/lib/tracking";

type Args = {
  from: GeoPoint | null | undefined;
  to: GeoPoint | null | undefined;
  /** Skip the network call when the screen has no use for a route. */
  enabled?: boolean;
};

/**
 * Loads an OSRM route between two points, with automatic straight-line
 * fallback. Never throws — the tracking card stays readable when OSRM is
 * rate-limited, blocked, or the phone is offline.
 *
 * Mirrors `hooks/useRoute.ts` in gridgo-rider.
 */
export function useRoute({ from, to, enabled = true }: Args) {
  // The answer is remembered against the leg it answers, so a new leg shows
  // no stale route and reads as loading until its own answer lands.
  const key =
    enabled && isGeoPoint(from) && isGeoPoint(to)
      ? `${from.lat},${from.lng}->${to.lat},${to.lng}`
      : null;
  const [answer, setAnswer] = useState<{ key: string; route: RouteResult } | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    if (!key || !isGeoPoint(from) || !isGeoPoint(to)) return;

    const id = ++seq.current;
    const controller = new AbortController();

    void (async () => {
      const result = await fetchRoute(from, to, { signal: controller.signal });
      // A newer request has already started; drop this answer.
      if (id !== seq.current) return;
      setAnswer({ key, route: result });
    })();

    return () => {
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const route = key && answer?.key === key ? answer.route : null;
  const loading = key !== null && answer?.key !== key;
  return { route, loading };
}
