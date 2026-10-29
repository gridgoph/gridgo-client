import { expoAudio, type AudioModule, type AudioPlayer } from "@/lib/expoAudio";

/**
 * One of GRIDGO's in-app sounds — the update chime (#230), the receipt's ping
 * (#229, #339) — or silence.
 *
 * **It follows the phone's silent mode.** Every play first sets the audio
 * session to `playsInSilentMode: false` and mixes with whatever else is
 * playing. On iOS that is the ambient category, which the ring/silent switch
 * mutes. On Android expo-audio refuses `play()` while the ringer is on silent
 * or vibrate. The mode is set on each play, not once, because the opening's
 * stings set the session to play through silent mode at launch.
 *
 * The in-app mute (Settings > App sounds) is the caller's to check: this only
 * plays what it is asked to.
 *
 * `volume` (0–1) scales the sound under the phone's own volume, so a sound can
 * sit quieter than its file without ever being louder than the phone allows.
 * Left out, the player keeps its own.
 *
 * The player is created up front: loading a file at the moment it is wanted
 * puts an audible gap between what moves on screen and its sound, and Expo Go
 * serves the file over Metro, so the first play would be silent. A play that
 * arrives before the file is loaded waits for it, briefly — a sound that lands
 * long after its moment belongs to nothing.
 *
 * Any failure — no native module, a refused session, a browser that blocks
 * audio before a tap — ends the same way: the moment runs silent.
 */
export type AppSound = {
  play: () => void;
  /** Hands the player back. Safe to call twice; plays after it do nothing. */
  release: () => void;
};

/** The longest a play waits on a file still loading. */
export const SOUND_LOAD_WAIT_MS = 400;

/** Resolves once the player says it is loaded, or after `timeoutMs`. */
function loaded(player: AudioPlayer, timeoutMs: number): Promise<void> {
  // A player that does not say is taken at its word: play it.
  if (player.isLoaded !== false) return Promise.resolve();
  const started = Date.now();
  return new Promise((resolve) => {
    const tick = () => {
      if (player.isLoaded !== false || Date.now() - started >= timeoutMs) {
        resolve();
        return;
      }
      setTimeout(tick, 40);
    };
    tick();
  });
}

export function loadAppSound(
  source: number,
  audioModule: AudioModule | null = expoAudio(),
  { volume }: { volume?: number } = {},
): AppSound | null {
  if (!audioModule) return null;

  let player: AudioPlayer | null = null;
  let released = false;
  try {
    player = audioModule.createAudioPlayer(source, { downloadFirst: true });
    if (volume !== undefined) player.volume = volume;
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
        await loaded(current, SOUND_LOAD_WAIT_MS);
        if (released) return;
        await current.seekTo?.(0);
        await current.play();
      })().catch(() => {
        // Session refused or autoplay blocked. What is on screen still says it.
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
 * Play a sound once, from a tap — Settings, when sound is switched on, so the
 * client hears what they chose. The player is handed back after.
 */
export function playAppSoundOnce(
  source: number,
  audioModule: AudioModule | null = expoAudio(),
): void {
  const sound = loadAppSound(source, audioModule);
  if (!sound) return;
  sound.play();
  setTimeout(sound.release, 2000);
}

/**
 * Settings > the one switch for every in-app sound: the update chime and the
 * receipt's ping. One switch, because a client turning GRIDGO quiet means all
 * of it; the phone's silent mode mutes both as well.
 */
export const APP_SOUND_COPY = {
  label: "App sounds",
  caption:
    "A short chime when one of your orders moves, and a soft ping when your receipt prints. Your phone's silent mode still mutes them.",
} as const;
