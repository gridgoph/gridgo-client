import { usePriorities, hasRanked } from "@/store/priorities";

jest.mock("@/lib/api", () => ({
  getPreferences: jest.fn(),
  savePreferences: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require("@/lib/api");

beforeEach(() => {
  usePriorities.setState({ ranking: null, loaded: false, loading: false, error: null });
  api.getPreferences.mockReset();
  api.savePreferences.mockReset();
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

    await usePriorities.getState().save(["distance", "quality", "cost", "speed"]);

    expect(api.savePreferences).toHaveBeenCalledWith(["distance", "quality", "cost", "speed"]);
    expect(usePriorities.getState().ranking).toEqual(["distance", "quality", "cost", "speed"]);
    expect(usePriorities.getState().loaded).toBe(true);
  });

  it("lets a failure reach the screen rather than pretending it saved", async () => {
    api.savePreferences.mockRejectedValue(new Error("Network request failed"));

    await expect(
      usePriorities.getState().save(["speed", "quality", "cost", "distance"]),
    ).rejects.toThrow("Network request failed");
    expect(usePriorities.getState().ranking).toBeNull();
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
