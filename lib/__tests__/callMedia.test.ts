/**
 * Expo Go has no WebRTC native module, and requiring `react-native-webrtc`
 * there would throw. The probe must answer "cannot call" without ever
 * requiring the package, so the rest of the app keeps working.
 */

jest.mock("expo-constants", () => ({ __esModule: true, default: { appOwnership: null, executionEnvironment: "bare" } }));

const mockWebRtcRequired = jest.fn();
jest.mock("react-native-webrtc", () => {
  mockWebRtcRequired();
  return {
    RTCPeerConnection: class {},
    RTCSessionDescription: class {},
    RTCIceCandidate: class {},
    mediaDevices: { getUserMedia: jest.fn(async () => ({ getTracks: () => [], getAudioTracks: () => [] })) },
  };
});

import Constants from "expo-constants";
import { NativeModules } from "react-native";

const mockConstants = Constants as unknown as { appOwnership: string | null; executionEnvironment: string | null };

import { callsSupported, loadCallAudio, loadCallMedia, resetCallAudioForTests, resetCallMediaForTests } from "@/lib/callMedia";

beforeEach(() => {
  resetCallMediaForTests();
  resetCallAudioForTests();
  mockWebRtcRequired.mockClear();
  mockConstants.appOwnership = null;
  mockConstants.executionEnvironment = "bare";
  delete (NativeModules as Record<string, unknown>).WebRTCModule;
  delete (NativeModules as Record<string, unknown>).InCallManager;
});

it("answers no calls in Expo Go without requiring the module", () => {
  mockConstants.executionEnvironment = "storeClient";
  (NativeModules as Record<string, unknown>).WebRTCModule = {};
  expect(loadCallMedia()).toBeNull();
  expect(callsSupported()).toBe(false);
  expect(mockWebRtcRequired).not.toHaveBeenCalled();
});

it("answers no calls in an older build that lacks the native module", () => {
  expect(loadCallMedia()).toBeNull();
  expect(mockWebRtcRequired).not.toHaveBeenCalled();
});

it("loads WebRTC in a build that has it, asking for audio only", async () => {
  (NativeModules as Record<string, unknown>).WebRTCModule = {};
  const media = loadCallMedia();
  expect(media).not.toBeNull();
  expect(mockWebRtcRequired).toHaveBeenCalledTimes(1);
  await media!.microphone();
  const webrtc = jest.requireMock("react-native-webrtc") as { mediaDevices: { getUserMedia: jest.Mock } };
  expect(webrtc.mediaDevices.getUserMedia).toHaveBeenCalledWith({ audio: true, video: false });
});

it("goes quiet rather than crashing when the audio route module is missing", () => {
  const audio = loadCallAudio();
  expect(() => {
    audio.startRinging();
    audio.setSpeaker(true);
    audio.stopCall();
  }).not.toThrow();
});
