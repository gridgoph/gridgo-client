import {
  checkDeadline,
  describeLeadTime,
  earliestDeadline,
  formatDeadline,
  latestDeadline,
  MAX_LEAD_DAYS,
  MIN_LEAD_HOURS,
  parseDeadline,
  suggestedDeadline,
} from "@/lib/deadline";

const NOW = new Date("2026-08-09T08:00:00+08:00").getTime();
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

describe("bounds", () => {
  it("puts the earliest deadline one lead time out", () => {
    expect(earliestDeadline(NOW).getTime()).toBe(NOW + MIN_LEAD_HOURS * HOUR);
  });

  it("caps how far ahead a client may schedule", () => {
    expect(latestDeadline(NOW).getTime()).toBe(NOW + MAX_LEAD_DAYS * DAY);
  });

  it("opens the picker on a choosable instant", () => {
    const suggested = suggestedDeadline(NOW);
    expect(suggested.getTime()).toBeGreaterThanOrEqual(earliestDeadline(NOW).getTime());
    expect(suggested.getTime()).toBeLessThanOrEqual(latestDeadline(NOW).getTime());
  });
});

describe("checkDeadline", () => {
  it("asks for a deadline when there is none", () => {
    expect(checkDeadline("", NOW)).toEqual({
      ok: false,
      reason: expect.stringMatching(/pick a deadline/i),
    });
  });

  it("rejects an unparseable value rather than trusting it", () => {
    expect(checkDeadline("next Tuesday-ish", NOW).ok).toBe(false);
  });

  it("rejects a deadline inside the lead time and says the earliest one", () => {
    const result = checkDeadline(new Date(NOW + 2 * HOUR).toISOString(), NOW);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain(formatDeadline(earliestDeadline(NOW)));
  });

  it("rejects a deadline past the scheduling horizon", () => {
    const result = checkDeadline(new Date(NOW + (MAX_LEAD_DAYS + 1) * DAY).toISOString(), NOW);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(new RegExp(`${MAX_LEAD_DAYS} days`));
  });

  it("accepts a deadline inside the window", () => {
    expect(checkDeadline(new Date(NOW + 5 * DAY).toISOString(), NOW)).toEqual({
      ok: true,
      reason: null,
    });
  });
});

describe("formatDeadline", () => {
  it("never shows a raw ISO string", () => {
    const formatted = formatDeadline("2026-08-15T10:00:00+08:00");
    expect(formatted).not.toContain("T");
    expect(formatted).toContain("Aug");
  });

  it("says so plainly when nothing is set", () => {
    expect(formatDeadline("")).toBe("Not set");
    expect(formatDeadline(null)).toBe("Not set");
  });
});

describe("parseDeadline", () => {
  it("returns null rather than an invalid date", () => {
    expect(parseDeadline("not a date")).toBeNull();
    expect(parseDeadline("")).toBeNull();
  });
});

describe("describeLeadTime", () => {
  it("counts hours inside a day and days beyond it", () => {
    expect(describeLeadTime(new Date(NOW + 6 * HOUR), NOW)).toBe("in 6 hours");
    expect(describeLeadTime(new Date(NOW + DAY), NOW)).toBe("tomorrow");
    expect(describeLeadTime(new Date(NOW + 4 * DAY), NOW)).toBe("in 4 days");
  });

  it("does not pretend a past deadline is upcoming", () => {
    expect(describeLeadTime(new Date(NOW - DAY), NOW)).toBe("in the past");
  });
});
