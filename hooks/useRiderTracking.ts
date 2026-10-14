import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";

import { useLiveRefresh } from "@/hooks/useLiveRefresh";
import * as api from "@/lib/api";
import { trackingRefreshMs, type TrackingSnapshot } from "@/lib/tracking";
import { usePlatformSettings } from "@/store/platformSettings";

/** How often the age on screen is re-read between position reads. */
const CLOCK_MS = 5_000;

export type RiderTrackingState = {
  /** The newest answer, or null before the first one lands. */
  snapshot: TrackingSnapshot | null;
  /** The newest read failed; what is on screen is the one before it. */
  failed: boolean;
  /** A read is in flight. */
  checking: boolean;
  /** "Check for an update": asks now, without waiting for the timer. */
  refresh: () => Promise<void>;
  /** This phone's clock, ticking so ages count up between reads. */
  now: number;
};

/**
 * The rider's position for one order, kept current while the screen is open
 * (gridgo-api#217).
 *
 * It asks on focus, on every interval Super Admin set (15–30 s, carried in each
 * answer), whenever the app comes back to the foreground, and when the live
 * stream says the delivery changed. A failed read keeps the last answer and
 * says so. `onWindowChange` fires when GRIDGO's judgement of the window moves —
 * the pick-up that opens it, the delivery that closes it — because the order
 * itself has changed and is worth reading again.
 */
export function useRiderTracking(orderId: string, onWindowChange?: () => void): RiderTrackingState {
  const settingSeconds = usePlatformSettings(
    (state) => state.settings?.riderLocationRefreshIntervalSeconds ?? null,
  );
  // Keyed to the order: a different order is a different rider, and nothing
  // from the last one may stay on its map.
  const [answer, setAnswer] = useState<{ orderId: string; snapshot: TrackingSnapshot } | null>(
    null,
  );
  const [failedFor, setFailedFor] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const snapshot = answer?.orderId === orderId ? answer.snapshot : null;
  const failed = failedFor === orderId;

  const sequence = useRef(0);
  const lastStatus = useRef<string | null>(null);
  const windowChanged = useRef(onWindowChange);
  useEffect(() => {
    windowChanged.current = onWindowChange;
  }, [onWindowChange]);

  const refresh = useCallback(async () => {
    const mine = ++sequence.current;
    setChecking(true);
    try {
      const { ping, tracking } = await api.getRiderTracking(orderId);
      if (mine !== sequence.current) return;
      const receivedAt = Date.now();
      setAnswer({
        orderId,
        snapshot: {
          ping: ping ? { lat: ping.lat, lng: ping.lng, at: ping.at } : null,
          tracking,
          receivedAt,
        },
      });
      setNow(receivedAt);
      setFailedFor(null);
      // Only a change on the same order: opening another one is not news.
      const status = `${orderId}:${tracking?.status ?? ""}`;
      const previous = lastStatus.current;
      lastStatus.current = status;
      if (previous?.startsWith(`${orderId}:`) && previous !== status) windowChanged.current?.();
    } catch {
      // A failed read must not silently look like "no rider yet".
      if (mine === sequence.current) setFailedFor(orderId);
    } finally {
      if (mine === sequence.current) setChecking(false);
    }
  }, [orderId]);

  useLiveRefresh(["location", "dispatch"], refresh, { refreshOnFocus: false });

  const intervalMs = trackingRefreshMs(snapshot?.tracking, settingSeconds);
  useFocusEffect(
    useCallback(() => {
      void refresh();
      const poll = setInterval(() => void refresh(), intervalMs);
      const clock = setInterval(() => setNow(Date.now()), CLOCK_MS);
      const resume = AppState.addEventListener("change", (next) => {
        if (next === "active") void refresh();
      });
      return () => {
        sequence.current++;
        clearInterval(poll);
        clearInterval(clock);
        resume.remove();
      };
    }, [refresh, intervalMs]),
  );

  return { snapshot, failed, checking, refresh, now };
}
