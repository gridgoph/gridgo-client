import {
  COMMIT_DISTANCE,
  FLICK_VELOCITY,
  MARK_READ_DISTANCE,
  markReadOffset,
  marksRead,
  REVEAL_DISTANCE,
  REVEAL_WIDTH,
  restingOffset,
  SWIPE_ACTIVE_OFFSET_X,
  SWIPE_FAIL_OFFSET_Y,
  swipeOffset,
  swipeRelease,
} from "@/lib/swipeRow";

describe("swipe rows claiming the touch", () => {
  it("takes a sideways drag before the list's own scroll can start", () => {
    // iOS's scroll recognizer begins at about 10pt in any direction. A row
    // that waits past that has lost the touch before it ever moves.
    expect(SWIPE_ACTIVE_OFFSET_X).toBeLessThan(10);
  });

  it("still swipes on a slightly diagonal thumb, and leaves a scroll to the list", () => {
    expect(SWIPE_FAIL_OFFSET_Y).toBeGreaterThan(SWIPE_ACTIVE_OFFSET_X);
    expect(SWIPE_FAIL_OFFSET_Y).toBeLessThanOrEqual(20);
  });
});

describe("basket row swipe", () => {
  describe("following the finger", () => {
    it("tracks leftward one to one", () => {
      expect(swipeOffset(0, -60)).toBe(-60);
      expect(swipeOffset(-REVEAL_WIDTH, -40)).toBe(-REVEAL_WIDTH - 40);
    });

    it("resists being pulled the wrong way rather than refusing", () => {
      expect(swipeOffset(0, 40)).toBe(10);
    });

    it("closes one to one from open", () => {
      expect(swipeOffset(-REVEAL_WIDTH, 40)).toBe(-REVEAL_WIDTH + 40);
    });
  });

  describe("where it goes when the finger lifts", () => {
    it("springs shut on a short drag", () => {
      expect(swipeRelease(-10, 0)).toBe("closed");
      expect(restingOffset("closed")).toBe(0);
    });

    it("rests open past the reveal distance", () => {
      expect(swipeRelease(-REVEAL_DISTANCE, 0)).toBe("open");
      expect(restingOffset("open")).toBe(-REVEAL_WIDTH);
    });

    it("opens on a flick rather than removing anything", () => {
      // A fast gesture is the one most likely to be an accident, so it can
      // only ever uncover the control — never commit to it.
      expect(swipeRelease(-12, -FLICK_VELOCITY - 100)).toBe("open");
    });

    it("reads velocity in points per second, as gesture-handler reports it", () => {
      // PanResponder's px/ms scale would make every slow drag a flick.
      expect(swipeRelease(-12, -2)).toBe("closed");
    });

    it("asks only after a long, deliberate drag", () => {
      expect(swipeRelease(-COMMIT_DISTANCE, 0)).toBe("commit");
      expect(swipeRelease(-COMMIT_DISTANCE + 1, 0)).toBe("open");
    });

    it("keeps commit well past the resting reveal, so opening cannot overshoot into it", () => {
      expect(COMMIT_DISTANCE).toBeGreaterThan(REVEAL_WIDTH * 1.5);
    });
  });
});

describe("inbox card swipe", () => {
  it("follows the finger left only", () => {
    expect(markReadOffset(-40)).toBe(-40);
    expect(markReadOffset(30)).toBe(0);
  });

  it("marks read only past the distance", () => {
    expect(marksRead(-MARK_READ_DISTANCE)).toBe(true);
    expect(marksRead(-MARK_READ_DISTANCE + 1)).toBe(false);
  });
});
