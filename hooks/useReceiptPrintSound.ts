import { useCallback, useEffect, useRef } from "react";

import { audio } from "@/constants/audio";
import { loadAppSound, type AppSound } from "@/lib/appSound";
import { useNotificationNudge } from "@/store/notificationNudge";

/**
 * The receipt's print sound (#229): loaded when the printed receipt mounts, so
 * it is ready by the time the slip feeds, and handed back when it unmounts.
 *
 * Returns the call that plays it. Settings > App sounds off plays nothing — the
 * mute is read at the moment of the print, so switching it never needs a
 * remount — and `lib/appSound.ts` keeps it under the phone's silent mode.
 */
export function useReceiptPrintSound(): () => void {
  const sound = useRef<AppSound | null>(null);

  useEffect(() => {
    sound.current = loadAppSound(audio.print);
    return () => {
      sound.current?.release();
      sound.current = null;
    };
  }, []);

  return useCallback(() => {
    if (useNotificationNudge.getState().muted) return;
    sound.current?.play();
  }, []);
}
