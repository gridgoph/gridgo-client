import { Platform } from "react-native";

import { audio } from "@/constants/audio";
import { expoAudio, type AudioPlayer } from "@/lib/expoAudio";

/**
 * The opening's two stings, or silence.
 *
 * `expo-audio` is a native module on iOS/Android. A binary built before it was
 * added does not carry it, and on such a build importing the package throws at
 * import time — which would take the launch overlay down with it and leave a
 * black screen. So native probes the module first and only requires the
 * package once it is really there, the same shape the optional pickers use.
 *
 * Web has no native module; it ships a JS player. Skipping the probe there is
 * what lets Expo Go / Expo web actually play the stings. A browser may still
 * block autoplay until a tap — cues remember they were asked and fire on the
 * first gesture.
 *
 * Sound is decoration here. Nothing about the launch depends on it, so every
 * failure ends the same way: the opening runs silent.
 *
 * `expo-audio` is deliberately **not** registered as a plugin in `app.json`.
 * Its config plugin exists to declare recording permissions — the microphone
 * string on iOS, `RECORD_AUDIO` on Android — and GRIDGO only ever plays. The
 * native module is autolinked from the dependency either way, so registering
 * the plugin would buy nothing and ask a client for a microphone the app never
 * opens.
 */

export type BrandStings = {
  /** Rides the dots. Cued as the first one lights. */
  intro: () => void;
  /** Lands with the wordmark on the yellow. */
  outro: () => void;
  /**
   * Play the sting that belongs to the current beat. Call this from a tap
   * handler: browsers refuse `play()` until then, and expo-audio's web player
   * does not catch that rejection.
   */
  armFromGesture: () => void;
  /** Hands both players back. Safe to call twice; cues after it do nothing. */
  release: () => void;
};

function webGestureActive(): boolean {
  if (Platform.OS !== "web" || typeof navigator === "undefined") return true;
  const activation = (navigator as { userActivation?: { isActive?: boolean } })
    .userActivation;
  return Boolean(activation?.isActive);
}

function cuePlay(player: AudioPlayer | null): boolean {
  if (!player) return false;
  try {
    player.muted = false;
    player.volume = 1;
  } catch {
    // Volume is best-effort; a sting is never worth taking the launch down for.
  }
  try {
    void player.seekTo?.(0);
  } catch {
    // Same.
  }
  try {
    const result = player.play();
    if (result && typeof (result as Promise<void>).catch === "function") {
      void (result as Promise<void>).catch(() => {
        // Autoplay blocked. A sting is never worth taking the launch down for.
      });
    }
    return true;
  } catch {
    return false;
  }
}

function waitUntilLoaded(player: AudioPlayer, timeoutMs: number): Promise<void> {
  if (player.isLoaded) return Promise.resolve();
  const started = Date.now();
  return new Promise((resolve) => {
    const tick = () => {
      if (player.isLoaded || Date.now() - started >= timeoutMs) {
        resolve();
        return;
      }
      setTimeout(tick, 40);
    };
    tick();
  });
}

/**
 * Both stings, decoded and ready, or `null` when this build has no audio.
 *
 * They are created up front rather than at their cue. Loading a file takes
 * long enough to put an audible gap between the first dot and the sound that
 * belongs to it — which is why the legacy screen preloaded them too.
 *
 * Expo Go serves `require()`d audio over Metro HTTP. Playing before that file
 * is on the device is a silent no-op, so we download-first and wait until
 * loaded. On web, `HTMLMediaElement.play()` rejects until a tap; cues only
 * *remember* they were asked, and `armFromGesture` is what actually calls
 * `play()`.
 */
export function loadBrandStings(): BrandStings | null {
  const audioModule = expoAudio();
  if (!audioModule) return null;

  let intro: AudioPlayer | null = null;
  let outro: AudioPlayer | null = null;
  let introWanted = false;
  let outroWanted = false;
  let released = false;

  const release = () => {
    released = true;
    for (const player of [intro, outro]) {
      try {
        player?.remove();
      } catch {
        // Already handed back, or the platform took it. Either way it is gone.
      }
    }
    intro = null;
    outro = null;
  };

  const playCurrentBeat = () => {
    if (released) return;
    if (outroWanted) cuePlay(outro);
    else if (introWanted) cuePlay(intro);
  };

  const ready = (async () => {
    await audioModule.setIsAudioActiveAsync?.(true);
    await audioModule.setAudioModeAsync?.({
      playsInSilentMode: true,
      interruptionMode: "mixWithOthers",
      shouldPlayInBackground: false,
    });
    if (released) return;
    // Expo Go has no packed copy of the m4a; downloadFirst writes it to tmp
    // so the native player is not asked to stream the Metro URL.
    intro = audioModule.createAudioPlayer(audio.intro, {
      downloadFirst: true,
      keepAudioSessionActive: true,
    });
    outro = audioModule.createAudioPlayer(audio.outro, {
      downloadFirst: true,
      keepAudioSessionActive: true,
    });
    await Promise.all([waitUntilLoaded(intro, 2500), waitUntilLoaded(outro, 2500)]);
  })().catch(() => {
    // Session or download failed. Cues become no-ops; the opening stays silent.
  });

  const playWhenReady = (which: "intro" | "outro") => {
    void ready.then(() => {
      if (released || !webGestureActive()) return;
      if (which === "intro" && introWanted) cuePlay(intro);
      if (which === "outro" && outroWanted) cuePlay(outro);
    });
  };

  return {
    intro: () => {
      introWanted = true;
      playWhenReady("intro");
    },
    outro: () => {
      outroWanted = true;
      playWhenReady("outro");
    },
    armFromGesture: () => {
      void ready.then(playCurrentBeat);
    },
    release,
  };
}
