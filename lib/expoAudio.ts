import { Platform } from "react-native";

/**
 * `expo-audio`, or nothing.
 *
 * It is a native module on iOS/Android. A binary built before it was added
 * does not carry it, and on such a build importing the package throws at
 * import time. So native probes the module first and only requires the
 * package once it is really there, the same shape the optional pickers use.
 *
 * Web has no native module; it ships a JS player. Skipping the probe there is
 * what lets Expo web actually play anything.
 *
 * Every GRIDGO sound is decoration, so every caller treats `null` the same
 * way: the moment runs silent.
 */

export type AudioPlayer = {
  play: () => void | Promise<void>;
  remove: () => void;
  isLoaded?: boolean;
  muted?: boolean;
  volume?: number;
  seekTo?: (seconds: number) => void | Promise<void>;
  addListener?: (
    event: "playbackStatusUpdate",
    listener: (status: { playing?: boolean }) => void,
  ) => { remove: () => void };
};

export type AudioModule = {
  createAudioPlayer: (
    source: number | string,
    options?: { downloadFirst?: boolean; keepAudioSessionActive?: boolean },
  ) => AudioPlayer;
  setIsAudioActiveAsync?: (active: boolean) => Promise<void>;
  setAudioModeAsync?: (mode: {
    playsInSilentMode?: boolean;
    interruptionMode?: "mixWithOthers" | "doNotMix" | "duckOthers";
    shouldPlayInBackground?: boolean;
  }) => Promise<void>;
};

/**
 * Whether this binary actually has the audio native module.
 *
 * Probing before requiring matters: a missing Expo module throws from the
 * package's own top level, and LogBox reports that as uncaught even from
 * inside a try/catch.
 */
function nativeAudioPresent(): boolean {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { requireOptionalNativeModule } = require("expo-modules-core") as {
      requireOptionalNativeModule: (name: string) => unknown;
    };
    return Boolean(requireOptionalNativeModule("ExpoAudio"));
  } catch {
    return false;
  }
}

export function expoAudio(): AudioModule | null {
  try {
    if (Platform.OS !== "web" && !nativeAudioPresent()) return null;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("expo-audio") as AudioModule;
  } catch {
    return null;
  }
}
