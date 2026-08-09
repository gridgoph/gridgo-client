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
  const [route, setRoute] = useState<RouteResult | null>(null);
  const [loading, setLoading] = useState(false);
  const seq = useRef(0);

  useEffect(() => {
    if (!enabled || !isGeoPoint(from) || !isGeoPoint(to)) {
      setRoute(null);
      setLoading(false);
      return;
    }

    const id = ++seq.current;
    const controller = new AbortController();
    setLoading(true);

    void (async () => {
      const result = await fetchRoute(from, to, { signal: controller.signal });
      // A newer request has already started; drop this answer.
      if (id !== seq.current) return;
      setRoute(result);
      setLoading(false);
    })();

    return () => {
      controller.abort();
    };
  }, [from?.lat, from?.lng, to?.lat, to?.lng, enabled]);

  return { route, loading };
}
