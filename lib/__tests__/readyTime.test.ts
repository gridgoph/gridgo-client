import { readyByDate } from "@/lib/readyTime";
import { printTimeLine } from "@/lib/listing";

describe("client ready time", () => {
  it("formats the API promise in Davao time, including minutes and the date", () => {
    expect(readyByDate("2026-09-26T06:30:00.000Z")).toBe("Sat, Sep 26, 2026 · 2:30 PM");
    expect(readyByDate("2026-09-26T18:00:00.000Z")).toBe("Sun, Sep 27, 2026 · 2:00 AM");
  });

  it.each([null, undefined, "", "not-a-date"])("omits an unavailable promise (%s)", (value) => {
    expect(readyByDate(value)).toBeNull();
  });

  it("labels working hours as press time, never elapsed days or a ready promise", () => {
    expect(printTimeLine(3)).toBe("Prints in about 3 hours");
    expect(printTimeLine(1)).toBe("Prints in about 1 hour");
    expect(printTimeLine(30)).toBe("Prints in about 30 hours");
  });

  it.each([null, undefined, 0, -1, NaN, Infinity])("omits unavailable press time (%s)", (hours) => {
    expect(printTimeLine(hours)).toBeNull();
  });
});
