import { audio } from "@/constants/audio";
import { expoAudio, type AudioModule, type AudioPlayer } from "@/lib/expoAudio";

/**
 * The chime for a new order update, or silence (#230).
 *
 * **It follows the phone's silent mode.** Every play first sets the audio
 * session to `playsInSilentMode: false` and mixes with whatever else is
 * playing. On iOS that is the ambient category, which the ring/silent switch
 * mutes. On Android expo-audio refuses `play()` while the ringer is on silent
 * or vibrate. The mode is set on each play, not once, because the opening's
 * stings set the session to play through silent mode at launch.
 *
 * The player is created up front: loading a file at the moment of the update
 * puts an audible gap between the bell's swing and its sound, and Expo Go
 * serves the file over Metro, so the first play would be silent.
 *
 * Any failure — no native module, a refused session, a browser that blocks
 * audio before a tap — ends the same way: the bell swings without a sound.
 */
export type UpdateChime = {
  play: () => void;
  /** Hands the player back. Safe to call twice; plays after it do nothing. */
  release: () => void;
};

export function loadUpdateChime(
  audioModule: AudioModule | null = expoAudio(),
): UpdateChime | null {
  if (!audioModule) return null;

  let player: AudioPlayer | null = null;
  let released = false;
  try {
    player = audioModule.createAudioPlayer(audio.update, { downloadFirst: true });
  } catch {
    return null;
  }

  return {
    play: () => {
      if (released || !player) return;
      const current = player;
      void (async () => {
        await audioModule.setAudioModeAsync?.({
          playsInSilentMode: false,
          interruptionMode: "mixWithOthers",
          shouldPlayInBackground: false,
        });
        if (released) return;
        await current.seekTo?.(0);
        await current.play();
      })().catch(() => {
        // Session refused or autoplay blocked. The swing still says it.
      });
    },
    release: () => {
      released = true;
      try {
        player?.remove();
      } catch {
        // Already handed back.
      }
      player = null;
    },
  };
}

/**
 * Play the chime once, from a tap — Settings, when the sound is switched on,
 * so the client hears what they chose. The player is handed back after.
 */
export function previewUpdateChime(audioModule: AudioModule | null = expoAudio()): void {
  const chime = loadUpdateChime(audioModule);
  if (!chime) return;
  chime.play();
  setTimeout(chime.release, 2000);
}
