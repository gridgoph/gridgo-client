import { act, render } from "@testing-library/react-native";

import { BrandIntro } from "@/components/BrandIntro";
import {
  LEAD_IN,
  SOUND_WAIT_MS,
  introTimeline,
  reducedTimeline,
} from "@/lib/brandIntroTiming";
import { loadBrandStings, type BrandStings } from "@/lib/brandSound";
import { useReducedMotion } from "@/hooks/useReducedMotion";

/**
 * #237: the opening's motion starts with its sound on a phone, rather than on
 * a timer the sound could not keep up with. What a test can hold is the order
 * of things: no first beat before the stings are ready, a silent run once the
 * wait is spent, and the overlay handed back when the timeline says so.
 */

jest.mock("@/lib/brandSound", () => ({ loadBrandStings: jest.fn() }));
jest.mock("@/hooks/useReducedMotion", () => ({ useReducedMotion: jest.fn() }));

const mockedLoad = loadBrandStings as jest.MockedFunction<typeof loadBrandStings>;
const mockedReduced = useReducedMotion as jest.MockedFunction<typeof useReducedMotion>;

function fakeStings() {
  let markReady: (loaded: boolean) => void = () => {};
  const stings: BrandStings & { intro: jest.Mock; outro: jest.Mock } = {
    ready: new Promise<boolean>((resolve) => (markReady = resolve)),
    intro: jest.fn(() => Promise.resolve()),
    outro: jest.fn(),
    armFromGesture: jest.fn(),
    release: jest.fn(),
  };
  return { stings, markReady };
}

async function advance(ms: number) {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });
}

beforeEach(() => {
  jest.useFakeTimers();
  mockedReduced.mockReturnValue(false);
});

afterEach(() => {
  jest.useRealTimers();
});

describe("BrandIntro timing", () => {
  it("holds the first beat until the stings are ready, then starts with the intro", async () => {
    const { stings, markReady } = fakeStings();
    mockedLoad.mockReturnValue(stings);
    const onDone = jest.fn();
    await render(<BrandIntro onDone={onDone} />);

    await advance(LEAD_IN + 100);
    expect(stings.intro).not.toHaveBeenCalled();

    await act(async () => markReady(true));
    await advance(0);
    expect(stings.intro).toHaveBeenCalledTimes(1);

    const timeline = introTimeline(LEAD_IN + 100);
    await advance(timeline.wordmarkAt - (LEAD_IN + 100) - 1);
    expect(stings.outro).not.toHaveBeenCalled();
    await advance(1);
    expect(stings.outro).toHaveBeenCalledTimes(1);

    await advance(timeline.endAt - timeline.wordmarkAt - 1);
    expect(onDone).not.toHaveBeenCalled();
    await advance(1);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("runs silent once the wait is spent, rather than a sting landing mid-cascade", async () => {
    const { stings, markReady } = fakeStings();
    mockedLoad.mockReturnValue(stings);
    const onDone = jest.fn();
    await render(<BrandIntro onDone={onDone} />);

    const cap = LEAD_IN + SOUND_WAIT_MS;
    await advance(cap);
    await act(async () => markReady(true));
    await advance(0);
    expect(stings.intro).not.toHaveBeenCalled();

    await advance(introTimeline(cap).endAt - cap);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("does not wait at all when the build has no audio", async () => {
    mockedLoad.mockReturnValue(null);
    const onDone = jest.fn();
    await render(<BrandIntro onDone={onDone} />);

    await advance(introTimeline().endAt - 1);
    expect(onDone).not.toHaveBeenCalled();
    await advance(1);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("with reduced motion, plays only the outro and leaves after the short hold", async () => {
    mockedReduced.mockReturnValue(true);
    const { stings, markReady } = fakeStings();
    mockedLoad.mockReturnValue(stings);
    const onDone = jest.fn();
    await render(<BrandIntro onDone={onDone} />);

    await act(async () => markReady(true));
    await advance(0);
    expect(stings.outro).toHaveBeenCalledTimes(1);
    expect(stings.intro).not.toHaveBeenCalled();

    await advance(reducedTimeline().endAt);
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(stings.intro).not.toHaveBeenCalled();
  });
});
