import {
  COMMIT_DISTANCE,
  FLICK_VELOCITY,
  isHorizontalSwipe,
  REVEAL_DISTANCE,
  REVEAL_WIDTH,
  restingOffset,
  swipeOffset,
  swipeRelease,
} from "@/lib/swipeRow";

describe("basket row swipe", () => {
  describe("claiming the gesture", () => {
    it("takes a sideways drag", () => {
      expect(isHorizontalSwipe(-40, 4)).toBe(true);
    });

    it("leaves a vertical drag to the list underneath", () => {
      expect(isHorizontalSwipe(-12, 40)).toBe(false);
    });

    it("ignores a tap that wandered a pixel or two", () => {
      expect(isHorizontalSwipe(-4, 0)).toBe(false);
    });
  });

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
      expect(swipeRelease(-12, -FLICK_VELOCITY - 0.1)).toBe("open");
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
