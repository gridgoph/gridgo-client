import { audio } from "@/constants/audio";
import { loadAppSound, playAppSoundOnce, type AppSound } from "@/lib/appSound";
import { expoAudio, type AudioModule } from "@/lib/expoAudio";

/**
 * The chime for a new order update, or silence (#230).
 *
 * It follows the phone's silent mode and waits briefly on a file still
 * loading — `lib/appSound.ts` owns both, shared with the receipt's print.
 * When it cannot play, the bell swings without a sound.
 */
export type UpdateChime = AppSound;

export function loadUpdateChime(
  audioModule: AudioModule | null = expoAudio(),
): UpdateChime | null {
  return loadAppSound(audio.update, audioModule);
}

/**
 * Play the chime once, from a tap — Settings, when sound is switched on, so
 * the client hears what they chose. The player is handed back after.
 */
export function previewUpdateChime(audioModule: AudioModule | null = expoAudio()): void {
  playAppSoundOnce(audio.update, audioModule);
}
