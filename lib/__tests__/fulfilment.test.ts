import type { PayoutMilestone } from "@/lib/api";
import {
  CLIENT_VISIBLE_MILESTONES,
  fulfilmentSteps,
  fulfilmentSummary,
} from "@/lib/fulfilment";

function milestones(statuses: Record<string, string> = {}): PayoutMilestone[] {
  return [
    { code: "printing", sharePercent: 50, status: "pending_pof", pofFileIds: [] },
    { code: "packaging_qc", sharePercent: 15, status: "pending_pof", pofFileIds: [] },
    { code: "delivered", sharePercent: 25, status: "pending_pof", pofFileIds: [] },
    { code: "retention", sharePercent: 10, status: "pending_pof", pofFileIds: [] },
  ].map((milestone) => ({ ...milestone, status: statuses[milestone.code] ?? milestone.status }));
}

describe("fulfilmentSteps", () => {
  it("shows making and moving the job, and not the payout hold-back", () => {
    // `retention` is released to the supplier after the issue window. It is
    // not a thing that happens to the client's order.
    expect(CLIENT_VISIBLE_MILESTONES).toEqual(["printing", "packaging_qc", "delivered"]);
    expect(fulfilmentSteps(milestones()).map((step) => step.code)).toEqual([
      "printing",
      "packaging_qc",
      "delivered",
    ]);
  });

  it("keeps the platform's order rather than the array's", () => {
    const shuffled = [...milestones()].reverse();
    expect(fulfilmentSteps(shuffled).map((step) => step.code)).toEqual([
      "printing",
      "packaging_qc",
      "delivered",
    ]);
  });

  it("separates evidence filed from evidence checked", () => {
    const steps = fulfilmentSteps(
      milestones({ printing: "released", packaging_qc: "pof_attached" }),
    );
    expect(steps[0].statusLabel).toBe("Done and checked");
    expect(steps[1].statusLabel).toBe("Done, with Operations");
    expect(steps[2].statusLabel).toBe("Not started");
  });

  it("gives every step an icon and a label, so it reads in greyscale", () => {
    for (const step of fulfilmentSteps(milestones({ printing: "released" }))) {
      expect(step.icon).toBeTruthy();
      expect(step.statusLabel).toBeTruthy();
      expect(step.label).not.toMatch(/_/);
      expect(step.statusLabel).not.toMatch(/_/);
    }
  });

  it("renders nothing before a supplier has accepted and milestones exist", () => {
    expect(fulfilmentSteps([])).toEqual([]);
    expect(fulfilmentSteps(undefined)).toEqual([]);
  });
});

describe("fulfilmentSummary", () => {
  it("counts what has actually been evidenced", () => {
    expect(fulfilmentSummary(fulfilmentSteps(milestones()))).toMatch(/not filed anything/i);
    expect(fulfilmentSummary(fulfilmentSteps(milestones({ printing: "released" })))).toBe(
      "1 of 3 steps done.",
    );
    expect(
      fulfilmentSummary(
        fulfilmentSteps(
          milestones({ printing: "released", packaging_qc: "released", delivered: "released" }),
        ),
      ),
    ).toMatch(/every step/i);
  });
});
