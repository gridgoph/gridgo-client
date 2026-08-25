import {
  PRIORITIES,
  isCompleteRanking,
  rankOf,
  rankingSentence,
  togglePlacement,
  type Priority,
} from "@/lib/priorities";

describe("isCompleteRanking", () => {
  it("accepts all three, each once", () => {
    expect(isCompleteRanking(["speed", "quality", "distance"])).toBe(true);
  });

  it("refuses a half-made ranking", () => {
    // Two priorities cannot decide between three shops, and a matcher handed
    // one would silently ignore whatever was left out.
    expect(isCompleteRanking(["speed", "quality"])).toBe(false);
    expect(isCompleteRanking([])).toBe(false);
  });

  it("refuses a repeat, a stranger, and anything that is not a list", () => {
    expect(isCompleteRanking(["speed", "speed", "quality"])).toBe(false);
    expect(isCompleteRanking(["speed", "quality", "price"])).toBe(false);
    expect(isCompleteRanking("speed")).toBe(false);
    expect(isCompleteRanking(null)).toBe(false);
  });
});

describe("togglePlacement", () => {
  it("puts an unplaced priority next in line", () => {
    expect(togglePlacement([], "speed")).toEqual(["speed"]);
    expect(togglePlacement(["speed"], "quality")).toEqual(["speed", "quality"]);
  });

  it("takes a placed priority out along with everything after it", () => {
    // Someone correcting second place has not yet decided third. Leaving third
    // where it was would quietly promote it to second.
    expect(togglePlacement(["speed", "quality", "distance"], "quality")).toEqual(["speed"]);
  });

  it("clears the lot when the first is tapped again", () => {
    expect(togglePlacement(["speed", "quality", "distance"], "speed")).toEqual([]);
  });
});

describe("rankOf", () => {
  it("counts from one, and answers null for anything unplaced", () => {
    const order: Priority[] = ["distance", "quality"];
    expect(rankOf(order, "distance")).toBe(1);
    expect(rankOf(order, "quality")).toBe(2);
    expect(rankOf(order, "speed")).toBeNull();
  });
});

describe("rankingSentence", () => {
  it("reads the finished order back in the order it matches on", () => {
    expect(rankingSentence(["speed", "distance", "quality"])).toBe(
      "GRIDGO matches on speed first, then distance, then quality.",
    );
  });

  it("says how far a half-made one has got, without claiming it is settled", () => {
    expect(rankingSentence(["speed"])).toBe("So far: speed.");
    expect(rankingSentence([])).toBe("Nothing ranked yet.");
  });

  it("covers every priority it is given", () => {
    const sentence = rankingSentence([...PRIORITIES]);
    for (const priority of PRIORITIES) {
      expect(sentence).toContain(priority);
    }
  });
});
