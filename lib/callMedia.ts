import Constants from "expo-constants";
import { Linking, NativeModules, PermissionsAndroid, Platform } from "react-native";

import type { CallIceServer } from "@/lib/orderCalls";
import { isExpoGoRuntime } from "@/lib/push";

/*
  The native half of a call, or nothing.

  Audio goes through `react-native-webrtc`, a native module that Expo Go does
  not carry. Requiring it there throws, so — the same shape as
  `getNotificationsNative` in `store/push.ts` — nothing in the app imports it
  statically. `loadCallMedia` probes for the module first and answers null when
  it is missing, and every caller treats null as "this build cannot call",
  which the screens word as "Calls need the latest GRIDGO app". A missing
  module costs calls, never the app.

  Web uses the browser's own WebRTC, which has the same shape.

  Speaker, ringtone and ringback go through `react-native-incall-manager`,
  probed the same way. Its Android ringtone reads the ringer mode: silent
  rings and vibrates for nothing, vibrate-only vibrates without sound. On iOS
  the ringtone plays in a category that obeys the silent switch.
*/

export type CallTrack = { enabled: boolean; kind?: string; stop: () => void };

export type CallStream = {
  getTracks: () => CallTrack[];
  getAudioTracks: () => CallTrack[];
};

export type CallSessionDescription = { type: string; sdp?: string | null };

export type CallPeer = {
  addTrack: (track: CallTrack, stream: CallStream) => unknown;
  createOffer: (options?: Record<string, unknown>) => Promise<CallSessionDescription>;
  createAnswer: () => Promise<CallSessionDescription>;
  setLocalDescription: (description: unknown) => Promise<void>;
  setRemoteDescription: (description: unknown) => Promise<void>;
  addIceCandidate: (candidate: unknown) => Promise<void>;
  addEventListener: (type: string, listener: (event: never) => void) => void;
  close: () => void;
  iceConnectionState?: string;
  connectionState?: string;
};

export type CallMedia = {
  createPeer: (iceServers: CallIceServer[]) => CallPeer;
  description: (init: { type: string; sdp: string }) => unknown;
  candidate: (init: { candidate: string; sdpMid: string | null; sdpMLineIndex: number | null }) => unknown;
  /** Audio only. Never asks for the camera. */
  microphone: () => Promise<CallStream>;
};

type WebRtcModule = {
  RTCPeerConnection: new (config: { iceServers: CallIceServer[] }) => CallPeer;
  RTCSessionDescription: new (init: { type: string; sdp: string }) => unknown;
  RTCIceCandidate: new (init: { candidate: string; sdpMid: string | null; sdpMLineIndex: number | null }) => unknown;
  mediaDevices: { getUserMedia: (constraints: { audio: boolean; video: boolean }) => Promise<CallStream> };
};

function fromModule(module: WebRtcModule): CallMedia {
  return {
    createPeer: (iceServers) => new module.RTCPeerConnection({ iceServers }),
    description: (init) => new module.RTCSessionDescription(init),
    candidate: (init) => new module.RTCIceCandidate(init),
    microphone: () => module.mediaDevices.getUserMedia({ audio: true, video: false }),
  };
}

function webModule(): WebRtcModule | null {
  const scope = globalThis as unknown as Partial<WebRtcModule> & {
    navigator?: { mediaDevices?: WebRtcModule["mediaDevices"] };
  };
  const mediaDevices = scope.navigator?.mediaDevices;
  if (!scope.RTCPeerConnection || !scope.RTCSessionDescription || !scope.RTCIceCandidate) return null;
  if (!mediaDevices?.getUserMedia) return null;
  return {
    RTCPeerConnection: scope.RTCPeerConnection,
    RTCSessionDescription: scope.RTCSessionDescription,
    RTCIceCandidate: scope.RTCIceCandidate,
    mediaDevices: { getUserMedia: (constraints) => mediaDevices.getUserMedia(constraints) },
  };
}

let cached: CallMedia | null | undefined;

/** The WebRTC surface, or null when this build cannot call (Expo Go, an older APK). */
export function loadCallMedia(): CallMedia | null {
  if (cached !== undefined) return cached;
  cached = null;
  try {
    if (Platform.OS === "web") {
      const web = webModule();
      cached = web ? fromModule(web) : null;
      return cached;
    }
    if (isExpoGoRuntime(Constants)) return cached;
    // Probe before requiring: the package's own top level touches the module.
    if (!NativeModules.WebRTCModule) return cached;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    cached = fromModule(require("react-native-webrtc") as WebRtcModule);
  } catch {
    cached = null;
  }
  return cached;
}

export function callsSupported(): boolean {
  return loadCallMedia() != null;
}

/** Tests only: forget the probe. */
export function resetCallMediaForTests(): void {
  cached = undefined;
}

// ---------------------------------------------------------------------------
// Audio route, ringtone and ringback
// ---------------------------------------------------------------------------

export type CallAudio = {
  /** The incoming ring. Obeys silent and vibrate modes. */
  startRinging: () => void;
  stopRinging: () => void;
  /** Enter call audio (earpiece, proximity, screen on); ringback while it rings out. */
  startCall: (ringback: boolean) => void;
  stopRingback: () => void;
  setSpeaker: (on: boolean) => void;
  stopCall: () => void;
};

type InCallManagerModule = {
  start: (setup?: { media?: "audio" | "video"; auto?: boolean; ringback?: string }) => void;
  stop: (setup?: { busytone?: string }) => void;
  startRingtone: (ringtone: string, vibrate: number[], iosCategory: string, seconds: number) => void;
  stopRingtone: () => void;
  stopRingback: () => void;
  setForceSpeakerphoneOn: (flag: boolean) => void;
  setKeepScreenOn: (enable: boolean) => void;
};

const SILENT_AUDIO: CallAudio = {
  startRinging: () => undefined,
  stopRinging: () => undefined,
  startCall: () => undefined,
  stopRingback: () => undefined,
  setSpeaker: () => undefined,
  stopCall: () => undefined,
};

/** One ring's vibration: wait, buzz, rest — the shape phones use for a call. */
const RING_VIBRATION = [0, 900, 1100];
/** The API stops ringing at 30 seconds; the ringtone never outlasts it. */
const RING_SECONDS = 30;

function guarded(run: () => void): void {
  try {
    run();
  } catch {
    // Sound and routing are never worth taking a call down for.
  }
}

let audioCached: CallAudio | undefined;

export function loadCallAudio(): CallAudio {
  if (audioCached) return audioCached;
  audioCached = SILENT_AUDIO;
  if (Platform.OS === "web" || isExpoGoRuntime(Constants) || !NativeModules.InCallManager) return audioCached;
  let manager: InCallManagerModule;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const loaded = require("react-native-incall-manager") as { default?: InCallManagerModule } & InCallManagerModule;
    manager = loaded.default ?? loaded;
  } catch {
    return audioCached;
  }
  audioCached = {
    startRinging: () => guarded(() => manager.startRingtone("_DEFAULT_", RING_VIBRATION, "default", RING_SECONDS)),
    stopRinging: () => guarded(() => manager.stopRingtone()),
    startCall: (ringback) =>
      guarded(() => manager.start({ media: "audio", auto: true, ...(ringback ? { ringback: "_DTMF_" } : {}) })),
    stopRingback: () => guarded(() => manager.stopRingback()),
    setSpeaker: (on) => guarded(() => manager.setForceSpeakerphoneOn(on)),
    stopCall: () =>
      guarded(() => {
        manager.stopRingtone();
        manager.stop();
      }),
  };
  return audioCached;
}

/** Tests only. */
export function resetCallAudioForTests(): void {
  audioCached = undefined;
}

// ---------------------------------------------------------------------------
// Microphone permission
// ---------------------------------------------------------------------------

/**
 * `blocked` means the phone will not show the dialog again: only the phone's
 * settings can turn it on. `undetermined` includes "asked once, refused" on
 * Android, where the dialog can still be shown.
 */
export type MicPermission = "granted" | "undetermined" | "blocked";

type RecordingPermissions = {
  getRecordingPermissionsAsync?: () => Promise<{ granted: boolean; canAskAgain?: boolean }>;
  requestRecordingPermissionsAsync?: () => Promise<{ granted: boolean; canAskAgain?: boolean }>;
};

function recordingPermissions(): RecordingPermissions | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { requireOptionalNativeModule } = require("expo-modules-core") as {
      requireOptionalNativeModule: (name: string) => unknown;
    };
    if (!requireOptionalNativeModule("ExpoAudio")) return null;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("expo-audio") as RecordingPermissions;
  } catch {
    return null;
  }
}

function fromResponse(response: { granted: boolean; canAskAgain?: boolean }): MicPermission {
  if (response.granted) return "granted";
  return response.canAskAgain === false ? "blocked" : "undetermined";
}

export async function readMicPermission(): Promise<MicPermission> {
  try {
    if (Platform.OS === "android") {
      const granted = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
      return granted ? "granted" : "undetermined";
    }
    if (Platform.OS === "web") {
      const permissions = (globalThis as { navigator?: { permissions?: { query: (q: { name: string }) => Promise<{ state: string }> } } })
        .navigator?.permissions;
      const status = await permissions?.query({ name: "microphone" });
      if (status?.state === "granted") return "granted";
      if (status?.state === "denied") return "blocked";
      return "undetermined";
    }
    const module = recordingPermissions();
    const response = await module?.getRecordingPermissionsAsync?.();
    return response ? fromResponse(response) : "undetermined";
  } catch {
    return "undetermined";
  }
}

/** Raise the phone's own dialog. Only ever called from a tap. */
export async function requestMicPermission(): Promise<MicPermission> {
  try {
    if (Platform.OS === "android") {
      const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
      if (result === PermissionsAndroid.RESULTS.GRANTED) return "granted";
      return result === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN ? "blocked" : "undetermined";
    }
    if (Platform.OS === "web") {
      // The browser asks as the microphone is opened; the call opens it again.
      const media = loadCallMedia();
      if (!media) return "undetermined";
      const stream = await media.microphone();
      for (const track of stream.getTracks()) track.stop();
      return "granted";
    }
    const module = recordingPermissions();
    const response = await module?.requestRecordingPermissionsAsync?.();
    // No module to ask through: the call itself raises the dialog.
    return response ? fromResponse(response) : "granted";
  } catch {
    return Platform.OS === "web" ? "blocked" : "undetermined";
  }
}

export function openPhoneSettings(): void {
  void Linking.openSettings().catch(() => undefined);
}
