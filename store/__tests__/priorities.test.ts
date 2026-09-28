import { prefetchMatch } from "@/lib/matchPrefetch";
import { usePriorities, hasRanked } from "@/store/priorities";

jest.mock("@/lib/api", () => ({
  // `userFacingError` checks `instanceof ApiError` when a save fails.
  ApiError: jest.requireActual("@/lib/api").ApiError,
  getPreferences: jest.fn(),
  savePreferences: jest.fn(),
  matchShop: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require("@/lib/api");

beforeEach(() => {
  usePriorities.getState().reset();
  api.getPreferences.mockReset();
  api.savePreferences.mockReset();
  api.matchShop.mockReset();
});

describe("loading this account's ranking", () => {
  it("adopts a ranking the client actually gave", async () => {
    api.getPreferences.mockResolvedValue({
      ranking: ["speed", "distance", "cost", "quality"],
      version: 3,
      updatedAt: "2026-08-24T00:00:00.000Z",
    });

    await usePriorities.getState().load();

    expect(usePriorities.getState().ranking).toEqual(["speed", "distance", "cost", "quality"]);
    expect(hasRanked(usePriorities.getState())).toBe(true);
  });

  it("treats the platform default as unranked, because nobody chose it", async () => {
    // Version 0 is GRIDGO answering with its own order because the client never
    // did. Matching on that and calling it their choice is the one thing this
    // whole flow exists to avoid.
    api.getPreferences.mockResolvedValue({
      ranking: ["quality", "speed", "cost", "distance"],
      version: 0,
      updatedAt: null,
    });

    await usePriorities.getState().load();

    expect(usePriorities.getState().ranking).toBeNull();
    expect(hasRanked(usePriorities.getState())).toBe(false);
    expect(usePriorities.getState().loaded).toBe(true);
  });

  it("refuses a ranking that is not all three", async () => {
    api.getPreferences.mockResolvedValue({
      ranking: ["speed", "speed", "quality"],
      version: 2,
      updatedAt: null,
    });

    await usePriorities.getState().load();

    expect(usePriorities.getState().ranking).toBeNull();
  });

  it("still counts as loaded when GRIDGO cannot be reached", async () => {
    // The landing ladder draws nothing while this is outstanding, so a failed
    // read that left it unloaded would hold a client on a blank screen.
    api.getPreferences.mockRejectedValue(new Error("Network request failed"));

    await usePriorities.getState().load();

    expect(usePriorities.getState().loaded).toBe(true);
    expect(usePriorities.getState().ranking).toBeNull();
    expect(usePriorities.getState().error).toContain("Network request failed");
  });

  it("does not stampede GRIDGO when two screens ask at once", async () => {
    api.getPreferences.mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(() => resolve({ ranking: ["speed", "quality", "cost", "distance"], version: 1, updatedAt: null }), 5),
        ),
    );

    await Promise.all([usePriorities.getState().load(), usePriorities.getState().load()]);

    expect(api.getPreferences).toHaveBeenCalledTimes(1);
  });
});

describe("saving", () => {
  it("keeps what GRIDGO stored, not what was sent", async () => {
    api.savePreferences.mockResolvedValue({
      ranking: ["distance", "quality", "cost", "speed"],
      version: 1,
      updatedAt: "2026-08-24T00:00:00.000Z",
    });

    const kept = await usePriorities.getState().save(["distance", "quality", "cost", "speed"]);

    expect(kept).toBe(true);
    expect(api.savePreferences).toHaveBeenCalledWith(["distance", "quality", "cost", "speed"]);
    expect(usePriorities.getState().ranking).toEqual(["distance", "quality", "cost", "speed"]);
    expect(usePriorities.getState().loaded).toBe(true);
    expect(usePriorities.getState().saving).toBe(false);
    expect(usePriorities.getState().saveError).toBeNull();
  });

  it("says it is saving while GRIDGO has the request", async () => {
    let answer!: (value: unknown) => void;
    api.savePreferences.mockReturnValue(new Promise((resolve) => (answer = resolve)));

    const pending = usePriorities.getState().save(["speed", "quality", "cost", "distance"]);
    expect(usePriorities.getState().saving).toBe(true);

    answer({ ranking: ["speed", "quality", "cost", "distance"], version: 2, updatedAt: null });
    await pending;
    expect(usePriorities.getState().saving).toBe(false);
  });

  it("reports a failure as not saved, and never leaves it saving", async () => {
    // gridgo-client#127: the button sat on "Saving…" and the order was not kept.
    usePriorities.setState({ ranking: ["quality", "speed", "cost", "distance"], loaded: true });
    const timeout = new Error("The request timed out. Try again.");
    timeout.name = "TimeoutError";
    api.savePreferences.mockRejectedValue(timeout);

    const kept = await usePriorities.getState().save(["speed", "quality", "cost", "distance"]);

    expect(kept).toBe(false);
    expect(usePriorities.getState().saving).toBe(false);
    expect(usePriorities.getState().saveError).toBe("The request timed out. Try again.");
    // What GRIDGO holds is still the old order, and the app says so.
    expect(usePriorities.getState().ranking).toEqual(["quality", "speed", "cost", "distance"]);
  });

  it("clears the last failure when a retry lands", async () => {
    api.savePreferences.mockRejectedValueOnce(new Error("Network request failed"));
    await usePriorities.getState().save(["speed", "quality", "cost", "distance"]);
    expect(usePriorities.getState().saveError).not.toBeNull();

    api.savePreferences.mockResolvedValueOnce({
      ranking: ["speed", "quality", "cost", "distance"],
      version: 2,
      updatedAt: null,
    });
    const kept = await usePriorities.getState().save(["speed", "quality", "cost", "distance"]);

    expect(kept).toBe(true);
    expect(usePriorities.getState().saveError).toBeNull();
    expect(usePriorities.getState().ranking).toEqual(["speed", "quality", "cost", "distance"]);
  });

  it("drops a match started under the old order, so the next match uses the new one", async () => {
    api.matchShop.mockResolvedValue({ shop: { supplierId: "old" } });
    const input = { subcategoryCode: "flyers" };
    void prefetchMatch(input);
    expect(api.matchShop).toHaveBeenCalledTimes(1);
    api.savePreferences.mockResolvedValue({
      ranking: ["cost", "speed", "quality", "distance"],
      version: 2,
      updatedAt: null,
    });

    await usePriorities.getState().save(["cost", "speed", "quality", "distance"]);
    void prefetchMatch(input);

    // A second call: the prefetched answer was matched on the old order.
    expect(api.matchShop).toHaveBeenCalledTimes(2);
  });
});

describe("signing out", () => {
  it("forgets this account's answer without asking the next one", async () => {
    api.getPreferences.mockResolvedValue({
      ranking: ["speed", "quality", "cost", "distance"],
      version: 1,
      updatedAt: null,
    });
    await usePriorities.getState().load();

    usePriorities.getState().reset();

    expect(usePriorities.getState().ranking).toBeNull();
    expect(usePriorities.getState().loaded).toBe(false);
  });
});
