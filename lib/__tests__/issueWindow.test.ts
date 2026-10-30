import {
  checkIssueDescription,
  issueKindLabel,
  issueWindowClock,
  issueWindowLengthLabel,
  issueWindowOpenedAt,
  summarizeIssueWindow,
} from "@/lib/issueWindow";

const NOW = new Date("2026-08-09T12:00:00+08:00").getTime();
const HOUR = 60 * 60 * 1000;

const timeline = [
  { at: "2026-08-08T10:00:00+08:00", state: "out_for_delivery" },
  { at: "2026-08-09T09:00:00+08:00", state: "issue_window_open" },
];

describe("issueWindowOpenedAt", () => {
  it("takes the moment the window actually opened", () => {
    expect(issueWindowOpenedAt(timeline)).toBe("2026-08-09T09:00:00+08:00");
  });

  it("returns null when the job never got there", () => {
    expect(issueWindowOpenedAt([{ at: "x", state: "production" }])).toBeNull();
  });

  it("does not throw when the order carried no history", () => {
    expect(issueWindowOpenedAt(undefined)).toBeNull();
    expect(issueWindowOpenedAt(null)).toBeNull();
  });
});

describe("checkIssueDescription", () => {
  it("refuses an empty report and says why detail matters", () => {
    const result = checkIssueDescription("   ");
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/payout/i);
  });

  it("refuses a one-word report", () => {
    expect(checkIssueDescription("bad").ok).toBe(false);
  });

  it("accepts a specific report", () => {
    expect(checkIssueDescription("Colour is washed out on all 200 flyers").ok).toBe(true);
  });
});

describe("issueWindowLengthLabel", () => {
  it("says the length Operations set, in words", () => {
    // The window is one platform-wide setting now, so nothing may hard-code 24.
    expect(issueWindowLengthLabel(24)).toBe("24 hours");
    expect(issueWindowLengthLabel(1)).toBe("1 hour");
    expect(issueWindowLengthLabel(48)).toBe("2 days");
    expect(issueWindowLengthLabel(72)).toBe("3 days");
  });
});

describe("summarizeIssueWindow", () => {
  it("invites a report while the platform will accept one", () => {
    const status = summarizeIssueWindow({
      state: "issue_window_open",
      openedAt: timeline[1].at,
      expiresAt: new Date(NOW + 21 * HOUR).toISOString(),
      windowHours: 24,
      hasOpenIssue: false,
      now: NOW,
    });
    expect(status.canReport).toBe(true);
    expect(status.headline).toMatch(/everything okay/i);
    expect(status.detail).toContain("24 hours");
    expect(status.elapsedLabel).toMatch(/Delivered 3 hours ago/);
  });

  it("decides in two short sentences and keeps the consequences apart", () => {
    const status = summarizeIssueWindow({
      state: "issue_window_open",
      openedAt: timeline[1].at,
      expiresAt: new Date(NOW + 21 * HOUR).toISOString(),
      windowHours: 24,
      hasOpenIssue: false,
      now: NOW,
    });
    expect(status.detail).toBe(
      "Confirm only if everything is fine. If something is wrong, report it within 24 hours of delivery.",
    );
    expect(status.detail).not.toMatch(/payout/);
    expect(status.consequences).toMatch(/holds the supplier payout/);
    expect(status.consequences).toMatch(/closes on its own/);
  });

  it("takes the window length from the setting, not from a constant", () => {
    const status = summarizeIssueWindow({
      state: "issue_window_open",
      openedAt: timeline[1].at,
      windowHours: 48,
      hasOpenIssue: false,
      now: NOW,
    });
    expect(status.detail).toContain("2 days");
    expect(status.detail).not.toContain("24");
  });

  it("shows the real time left, because the platform now really expires it", () => {
    const status = summarizeIssueWindow({
      state: "issue_window_open",
      openedAt: timeline[1].at,
      expiresAt: new Date(NOW + 21 * HOUR).toISOString(),
      hasOpenIssue: false,
      now: NOW,
    });
    expect(status.remainingLabel).toBe("Closes in about 21 hours");
  });

  it("shows no time left when the order carries no expiry", () => {
    // Never a countdown invented by the app: the expiry is the platform's.
    const status = summarizeIssueWindow({
      state: "issue_window_open",
      openedAt: timeline[1].at,
      expiresAt: null,
      hasOpenIssue: false,
      now: NOW,
    });
    expect(status.remainingLabel).toBeNull();
    expect(status.elapsedLabel).toMatch(/ago/);
  });

  it("shows no time left once the expiry has passed", () => {
    const status = summarizeIssueWindow({
      state: "issue_window_open",
      openedAt: new Date(NOW - 30 * HOUR).toISOString(),
      expiresAt: new Date(NOW - 6 * HOUR).toISOString(),
      hasOpenIssue: false,
      now: NOW,
    });
    expect(status.remainingLabel).toBeNull();
  });

  it("stops a second report while one is already open", () => {
    const status = summarizeIssueWindow({
      state: "issue_window_open",
      openedAt: timeline[1].at,
      expiresAt: new Date(NOW + 21 * HOUR).toISOString(),
      hasOpenIssue: true,
      now: NOW,
    });
    expect(status.canReport).toBe(false);
    expect(status.headline).toMatch(/Operations received your report/i);
    expect(status.detail).toMatch(/outcome within 2 business days/);
  });

  it("closes the window once the job moves on", () => {
    const status = summarizeIssueWindow({
      state: "completed",
      openedAt: timeline[1].at,
      expiresAt: new Date(NOW + 21 * HOUR).toISOString(),
      hasOpenIssue: false,
      now: NOW,
    });
    expect(status.canReport).toBe(false);
    expect(status.detail).toMatch(/Operations/);
    // A closed window shows no time left, whatever the stamp says.
    expect(status.remainingLabel).toBeNull();
  });
});

describe("issueKindLabel", () => {
  it("never surfaces the API enum", () => {
    expect(issueKindLabel("material_quality")).toBe("Print or material quality");
    expect(issueKindLabel("nonsense")).not.toMatch(/_/);
  });
});

describe("issueWindowClock (report 5A28D524)", () => {
  const opened = new Date(NOW - 2 * HOUR).toISOString();

  it("counts down to the expiry the platform stamped, in hours, minutes and seconds", () => {
    const expires = new Date(NOW + 21 * HOUR + 47 * 60_000 + 9_000).toISOString();
    const clock = issueWindowClock({ openedAt: opened, expiresAt: expires, now: NOW });
    expect(clock?.clock).toBe("21:47:09");
    expect(clock?.spoken).toBe("21 hours 47 minutes left");
    expect(clock?.closesAt).toBe(new Date(expires).toISOString());
  });

  it("sizes the meter from the order's own stamps, never the app's default", () => {
    // A 72-hour window Operations set, with 18 hours gone: three quarters left.
    const clock = issueWindowClock({
      openedAt: new Date(NOW - 18 * HOUR).toISOString(),
      expiresAt: new Date(NOW + 54 * HOUR).toISOString(),
      windowHours: 24,
      now: NOW,
    });
    expect(clock?.fraction).toBeCloseTo(0.75);
    // Whole hours, so a long window still reads as one clock.
    expect(clock?.clock).toBe("54:00:00");
  });

  it("falls back to the platform setting when the order has no opening stamp", () => {
    const clock = issueWindowClock({
      openedAt: null,
      expiresAt: new Date(NOW + 12 * HOUR).toISOString(),
      windowHours: 48,
      now: NOW,
    });
    expect(clock?.fraction).toBeCloseTo(0.25);
  });

  it("stops at zero and says it is closing, rather than counting into the negative", () => {
    const clock = issueWindowClock({
      openedAt: opened,
      expiresAt: new Date(NOW - 5_000).toISOString(),
      now: NOW,
    });
    expect(clock?.remainingMs).toBe(0);
    expect(clock?.clock).toBe("00:00:00");
    expect(clock?.fraction).toBe(0);
    expect(clock?.spoken).toBe("Closing now");
  });

  it("speaks the last hour in minutes, and the last minute without a number", () => {
    const at = (ms: number) =>
      issueWindowClock({ openedAt: opened, expiresAt: new Date(NOW + ms).toISOString(), now: NOW })?.spoken;
    expect(at(HOUR + 60_000)).toBe("1 hour 1 minute left");
    expect(at(5 * 60_000 + 30_000)).toBe("5 minutes left");
    expect(at(30_000)).toBe("Less than a minute left");
  });

  it("draws no clock for an order without an expiry", () => {
    expect(issueWindowClock({ openedAt: opened, expiresAt: null, now: NOW })).toBeNull();
    expect(issueWindowClock({ openedAt: opened, expiresAt: "not a date", now: NOW })).toBeNull();
  });
});
