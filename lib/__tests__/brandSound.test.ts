import { PLAY_START_WAIT_MS } from "@/lib/brandIntroTiming";
import { loadBrandStings } from "@/lib/brandSound";
import { expoAudio, type AudioModule, type AudioPlayer } from "@/lib/expoAudio";

jest.mock("@/lib/expoAudio", () => {
  const actual = jest.requireActual("@/lib/expoAudio");
  return { ...actual, expoAudio: jest.fn(actual.expoAudio) };
});

const mockedExpoAudio = expoAudio as jest.MockedFunction<typeof expoAudio>;

type FakePlayer = AudioPlayer & {
  play: jest.Mock;
  emit: (status: { playing?: boolean }) => void;
};

/** A player that loads when told to and reports playing when told to. */
function fakePlayer(): FakePlayer {
  let listener: ((status: { playing?: boolean }) => void) | null = null;
  return {
    isLoaded: false,
    play: jest.fn(),
    remove: jest.fn(),
    seekTo: jest.fn(),
    addListener: (_event, next) => {
      listener = next;
      return { remove: () => (listener = null) };
    },
    emit: (status) => listener?.(status),
  };
}

function fakeAudio() {
  const players: FakePlayer[] = [];
  const audioModule: AudioModule = {
    createAudioPlayer: () => {
      const player = fakePlayer();
      players.push(player);
      return player;
    },
    setIsAudioActiveAsync: async () => {},
    setAudioModeAsync: async () => {},
  };
  return { audioModule, players };
}

/** Lets the loader's awaits run without moving the clock. */
async function flush() {
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
}

describe("loadBrandStings", () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  /*
    The opening's sound is decoration, and the rule that matters is what
    happens when it is not available: a binary built before `expo-audio` was
    added has no audio native module, and the launch overlay has to run silent
    rather than take the app down on the way in. Jest is exactly that
    environment, so this asserts the real fallback rather than a mock of it.
  */
  it("runs the opening silent instead of failing when a build has no audio", () => {
    expect(loadBrandStings()).toBeNull();
  });

  it("drops a sting asked for before it loaded, instead of playing it late (#237)", async () => {
    jest.useFakeTimers();
    const { audioModule, players } = fakeAudio();
    mockedExpoAudio.mockReturnValueOnce(audioModule);

    const stings = loadBrandStings()!;
    await flush();
    const [intro, outro] = players;

    await stings.intro();
    stings.outro();
    // The file arrives after its beat: nothing may start now.
    intro.isLoaded = true;
    outro.isLoaded = true;
    await jest.advanceTimersByTimeAsync(100);

    await expect(stings.ready).resolves.toBe(true);
    expect(intro.play).not.toHaveBeenCalled();
    expect(outro.play).not.toHaveBeenCalled();
    stings.release();
  });

  it("says when it is ready, and the intro resolves once it is really playing", async () => {
    jest.useFakeTimers();
    const { audioModule, players } = fakeAudio();
    mockedExpoAudio.mockReturnValueOnce(audioModule);

    const stings = loadBrandStings()!;
    await flush();
    const [intro] = players;
    for (const player of players) player.isLoaded = true;
    await jest.advanceTimersByTimeAsync(40);
    await expect(stings.ready).resolves.toBe(true);

    let heard = false;
    void stings.intro().then(() => (heard = true));
    expect(intro.play).toHaveBeenCalledTimes(1);
    await flush();
    expect(heard).toBe(false);

    intro.emit({ playing: true });
    await flush();
    expect(heard).toBe(true);
    stings.release();
  });

  it("does not hold the motion for a player that never reports playing", async () => {
    jest.useFakeTimers();
    const { audioModule, players } = fakeAudio();
    mockedExpoAudio.mockReturnValueOnce(audioModule);

    const stings = loadBrandStings()!;
    await flush();
    for (const player of players) player.isLoaded = true;
    await jest.advanceTimersByTimeAsync(40);
    await stings.ready;

    let heard = false;
    void stings.intro().then(() => (heard = true));
    await jest.advanceTimersByTimeAsync(PLAY_START_WAIT_MS - 1);
    expect(heard).toBe(false);
    await jest.advanceTimersByTimeAsync(1);
    expect(heard).toBe(true);
    stings.release();
  });

  it("reports not ready when the stings never load, so the opening runs silent", async () => {
    jest.useFakeTimers();
    const { audioModule } = fakeAudio();
    mockedExpoAudio.mockReturnValueOnce(audioModule);

    const stings = loadBrandStings()!;
    await flush();
    await jest.advanceTimersByTimeAsync(3000);

    await expect(stings.ready).resolves.toBe(false);
    stings.release();
  });
});
