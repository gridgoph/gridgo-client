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

  it("says production time in working days, never a ready promise", () => {
    expect(printTimeLine({ turnaroundDays: 1, turnaroundHours: 10 })).toBe("Prints in 1 working day");
    expect(printTimeLine({ turnaroundDays: 3, turnaroundHours: 30 })).toBe("Prints in 3 working days");
    expect(printTimeLine({ turnaroundDays: 3, minimumTurnaroundDays: 1, turnaroundHours: 30 })).toBe(
      "Prints in 1–3 working days",
    );
  });

  it("reads an older GRIDGO's hours the way its migration does, never as calendar days", () => {
    // 48 working hours at the default ten-hour day is five working days, not two.
    expect(printTimeLine({ turnaroundHours: 48 })).toBe("Prints in 5 working days");
    expect(printTimeLine({ turnaroundHours: 3 })).toBe("Prints in 1 working day");
    expect(printTimeLine({ turnaroundHours: 48, productionDayMinutes: 480 })).toBe(
      "Prints in 6 working days",
    );
  });

  it.each([null, undefined, 0, -1, NaN, Infinity])("omits unavailable production time (%s)", (hours) => {
    expect(printTimeLine({ turnaroundHours: hours as number | null })).toBeNull();
  });
});
