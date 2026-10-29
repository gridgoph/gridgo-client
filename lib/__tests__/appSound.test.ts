import { loadAppSound, playAppSoundOnce, SOUND_LOAD_WAIT_MS } from "@/lib/appSound";
import type { AudioModule } from "@/lib/expoAudio";

const settle = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));

function fakeAudio(player: Record<string, unknown>) {
  const audioModule: AudioModule = {
    createAudioPlayer: jest.fn(() => player as never),
    setAudioModeAsync: jest.fn(async () => undefined),
  };
  return audioModule;
}

/** Every in-app sound: the update chime and the receipt's print (#229). */
describe("loadAppSound", () => {
  it("is silence when the build has no audio module", () => {
    expect(loadAppSound(1, null)).toBeNull();
  });

  it("is silence when the player cannot be made", () => {
    const audioModule: AudioModule = {
      createAudioPlayer: () => {
        throw new Error("no decoder");
      },
    };
    expect(loadAppSound(1, audioModule)).toBeNull();
  });

  it("follows the phone's silent mode on every play, mixing with other audio", async () => {
    const player = { play: jest.fn(), remove: jest.fn(), seekTo: jest.fn() };
    const audioModule = fakeAudio(player);
    const sound = loadAppSound(7, audioModule);

    sound?.play();
    await settle();
    sound?.play();
    await settle();

    expect(audioModule.createAudioPlayer).toHaveBeenCalledWith(7, { downloadFirst: true });
    expect(audioModule.setAudioModeAsync).toHaveBeenCalledTimes(2);
    expect(audioModule.setAudioModeAsync).toHaveBeenLastCalledWith({
      playsInSilentMode: false,
      interruptionMode: "mixWithOthers",
      shouldPlayInBackground: false,
    });
    expect(player.seekTo).toHaveBeenLastCalledWith(0);
    expect(player.play).toHaveBeenCalledTimes(2);
  });

  it("plays at the volume it is given, and leaves the player's own when not", () => {
    const quiet: { play: jest.Mock; remove: jest.Mock; volume?: number } = {
      play: jest.fn(),
      remove: jest.fn(),
    };
    loadAppSound(7, fakeAudio(quiet), { volume: 0.6 });
    expect(quiet.volume).toBe(0.6);

    const untouched: { play: jest.Mock; remove: jest.Mock; volume?: number } = {
      play: jest.fn(),
      remove: jest.fn(),
    };
    loadAppSound(7, fakeAudio(untouched));
    expect(untouched.volume).toBeUndefined();
  });

  it("waits for a file still loading, then plays", async () => {
    const player = { play: jest.fn(), remove: jest.fn(), isLoaded: false };
    const sound = loadAppSound(7, fakeAudio(player));

    sound?.play();
    await settle(20);
    expect(player.play).not.toHaveBeenCalled();

    player.isLoaded = true;
    await settle(60);
    expect(player.play).toHaveBeenCalledTimes(1);
  });

  it("stops waiting on a file that never says it loaded", async () => {
    const player = { play: jest.fn(), remove: jest.fn(), isLoaded: false };
    const sound = loadAppSound(7, fakeAudio(player));

    sound?.play();
    await settle(SOUND_LOAD_WAIT_MS + 80);

    expect(player.play).toHaveBeenCalledTimes(1);
  });

  it("plays nothing after it is released, even mid-wait", async () => {
    const player = { play: jest.fn(), remove: jest.fn(), isLoaded: false };
    const sound = loadAppSound(7, fakeAudio(player));

    sound?.play();
    sound?.release();
    sound?.release();
    player.isLoaded = true;
    await settle(60);

    expect(player.play).not.toHaveBeenCalled();
    expect(player.remove).toHaveBeenCalledTimes(1);
  });

  it("goes quiet when the platform refuses the audio session", async () => {
    const player = { play: jest.fn(), remove: jest.fn() };
    const audioModule: AudioModule = {
      createAudioPlayer: () => player,
      setAudioModeAsync: jest.fn(async () => {
        throw new Error("session refused");
      }),
    };

    loadAppSound(7, audioModule)?.play();
    await settle();

    expect(player.play).not.toHaveBeenCalled();
  });
});

describe("playAppSoundOnce", () => {
  it("plays once and hands the player back after", async () => {
    jest.useFakeTimers();
    try {
      const player = { play: jest.fn(), remove: jest.fn() };
      playAppSoundOnce(7, fakeAudio(player));
      await jest.advanceTimersByTimeAsync(2000);
      expect(player.play).toHaveBeenCalledTimes(1);
      expect(player.remove).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });
});
