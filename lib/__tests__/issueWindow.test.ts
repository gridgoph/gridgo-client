import {
  checkIssueDescription,
  issueKindLabel,
  issueWindowOpenedAt,
  ISSUE_WINDOW_HOURS,
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

describe("summarizeIssueWindow", () => {
  it("invites a report while the platform will accept one", () => {
    const status = summarizeIssueWindow({
      state: "issue_window_open",
      openedAt: timeline[1].at,
      hasOpenIssue: false,
      now: NOW,
    });
    expect(status.canReport).toBe(true);
    expect(status.headline).toContain(String(ISSUE_WINDOW_HOURS));
    expect(status.elapsedLabel).toMatch(/Delivered 3 hours ago/);
  });

  it("shows elapsed time, never a countdown the server does not enforce", () => {
    const status = summarizeIssueWindow({
      state: "issue_window_open",
      openedAt: timeline[1].at,
      hasOpenIssue: false,
      now: NOW,
    });
    expect(status.elapsedLabel).toMatch(/ago/);
    expect(status.elapsedLabel).not.toMatch(/left|remaining/i);
  });

  it("still accepts a late report but says it is late", () => {
    const status = summarizeIssueWindow({
      state: "issue_window_open",
      openedAt: new Date(NOW - 30 * HOUR).toISOString(),
      hasOpenIssue: false,
      now: NOW,
    });
    expect(status.pastPolicyWindow).toBe(true);
    expect(status.canReport).toBe(true);
    expect(status.headline).toMatch(/past the 24-hour/i);
  });

  it("stops a second report while one is already open", () => {
    const status = summarizeIssueWindow({
      state: "issue_window_open",
      openedAt: timeline[1].at,
      hasOpenIssue: true,
      now: NOW,
    });
    expect(status.canReport).toBe(false);
    expect(status.headline).toMatch(/with Operations/i);
  });

  it("closes the window once the job moves on", () => {
    const status = summarizeIssueWindow({
      state: "completed",
      openedAt: timeline[1].at,
      hasOpenIssue: false,
      now: NOW,
    });
    expect(status.canReport).toBe(false);
    expect(status.detail).toMatch(/Operations/);
  });
});

describe("issueKindLabel", () => {
  it("never surfaces the API enum", () => {
    expect(issueKindLabel("material_quality")).toBe("Print or material quality");
    expect(issueKindLabel("nonsense")).not.toMatch(/_/);
  });
});
