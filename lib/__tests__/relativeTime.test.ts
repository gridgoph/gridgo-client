import { formatRelativeTime, isLocationStale, STALE_LOCATION_MS } from "@/lib/relativeTime";

describe("formatRelativeTime", () => {
  const now = new Date("2026-08-08T12:00:00.000Z").getTime();

  it("says just now for recent times", () => {
    expect(formatRelativeTime(now - 10_000, now)).toBe("Just now");
  });

  it("formats minutes and hours", () => {
    expect(formatRelativeTime(now - 3 * 60_000, now)).toBe("3 min ago");
    expect(formatRelativeTime(now - 2 * 60 * 60_000, now)).toBe("2h ago");
  });

  it("says yesterday within two days", () => {
    expect(formatRelativeTime(now - 30 * 60 * 60_000, now)).toBe("Yesterday");
  });
});

describe("isLocationStale", () => {
  const now = Date.now();

  it("is stale when missing", () => {
    expect(isLocationStale(null, now)).toBe(true);
  });

  it("is fresh within the window", () => {
    expect(isLocationStale(now - 30_000, now)).toBe(false);
  });

  it("is stale past the window", () => {
    expect(isLocationStale(now - STALE_LOCATION_MS - 1, now)).toBe(true);
  });
});
