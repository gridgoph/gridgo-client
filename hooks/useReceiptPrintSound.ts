import { useCallback, useEffect, useRef } from "react";

import { audio } from "@/constants/audio";
import { loadAppSound, type AppSound } from "@/lib/appSound";
import { expoAudio } from "@/lib/expoAudio";
import { PRINT_HUSH_MS, RECEIPT_SOUND_VOLUME } from "@/lib/receiptPrint";
import { useNotificationNudge } from "@/store/notificationNudge";

/**
 * The receipt's sound (#229) — a soft ping since #339: loaded when the printed receipt mounts, so
 * it is ready by the time the slip feeds, and handed back when it unmounts.
 *
 * Returns the call that plays it. Settings > App sounds off plays nothing — the
 * mute is read at the moment of the print, so switching it never needs a
 * remount — and `lib/appSound.ts` keeps it under the phone's silent mode.
 * The update chime keeps quiet around it, so the order's own notices landing
 * at the same moment do not ring over the print.
 */
export function useReceiptPrintSound(): () => void {
  const sound = useRef<AppSound | null>(null);

  useEffect(() => {
    sound.current = loadAppSound(audio.receipt, expoAudio(), { volume: RECEIPT_SOUND_VOLUME });
    return () => {
      sound.current?.release();
      sound.current = null;
    };
  }, []);

  return useCallback(() => {
    const nudge = useNotificationNudge.getState();
    nudge.hush(PRINT_HUSH_MS);
    if (nudge.muted) return;
    sound.current?.play();
  }, []);
}
