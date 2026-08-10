import {
  DISMISS_DISTANCE,
  dragOffset,
  SHEET_SPRING,
  shouldDismissOnRelease,
  THROW_VELOCITY,
} from "@/lib/sheet";

describe("dragOffset", () => {
  it("follows a downward drag one to one", () => {
    expect(dragOffset(0, 0)).toBe(0);
    expect(dragOffset(0, 80)).toBe(80);
    expect(dragOffset(40, 60)).toBe(100);
  });

  it("resists an upward drag instead of blocking it", () => {
    // The sheet still answers the finger past its stop, at a quarter rate.
    expect(dragOffset(0, -40)).toBe(-10);
    expect(dragOffset(20, -100)).toBe(-20);
  });

  it("never runs away upward — resistance grows the offset stays small", () => {
    expect(Math.abs(dragOffset(0, -400))).toBeLessThan(400);
  });
});

describe("shouldDismissOnRelease", () => {
  it("dismisses a deliberate drag past the threshold", () => {
    expect(shouldDismissOnRelease(DISMISS_DISTANCE + 1, 0)).toBe(true);
  });

  it("springs back from a short drag released slowly", () => {
    expect(shouldDismissOnRelease(DISMISS_DISTANCE - 1, 0)).toBe(false);
    expect(shouldDismissOnRelease(40, 0.2)).toBe(false);
  });

  it("dismisses a quick flick that never travelled far", () => {
    // The intention is clear from the speed even though the sheet barely moved.
    expect(shouldDismissOnRelease(20, THROW_VELOCITY + 0.1)).toBe(true);
  });

  it("ignores an upward flick", () => {
    expect(shouldDismissOnRelease(-30, -2)).toBe(false);
  });

  it("treats distance and speed as separate intentions, not a conjunction", () => {
    expect(shouldDismissOnRelease(200, 0)).toBe(true);
    expect(shouldDismissOnRelease(0, 2)).toBe(true);
  });
});

describe("SHEET_SPRING", () => {
  it("is damped past the point where it would visibly bounce", () => {
    // Critical damping is 2 * sqrt(stiffness * mass); at or above it the sheet
    // settles without overshoot, which is what stops it reading as a toy.
    const critical = 2 * Math.sqrt(SHEET_SPRING.stiffness * SHEET_SPRING.mass);
    expect(SHEET_SPRING.damping).toBeGreaterThanOrEqual(critical);
  });
});
