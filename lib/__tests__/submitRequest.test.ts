import {
  resumeSubmitPhase,
  submitPhaseBody,
  submitPhaseLabel,
  type SubmitPhase,
} from "@/lib/submitRequest";

const PHASES: SubmitPhase[] = ["creating", "attaching", "sending"];

describe("submit phase copy", () => {
  it("names every phase in the client's words, never the API's", () => {
    for (const phase of PHASES) {
      const said = `${submitPhaseLabel(phase)} ${submitPhaseBody(phase)}`;
      expect(said.length).toBeGreaterThan(0);
      // No state string, enum or snake_case identifier reaches the screen.
      expect(said).not.toMatch(/_|submitted|draft|transition/i);
    }
  });

  it("never apologises", () => {
    for (const phase of PHASES) {
      expect(submitPhaseBody(phase)).not.toMatch(/sorry|apolog/i);
    }
  });
});

describe("resumeSubmitPhase", () => {
  it("starts at the beginning for a job that does not exist yet", () => {
    expect(resumeSubmitPhase(false, false)).toBe("creating");
  });

  it("does not re-create a job that a failed send already created", () => {
    // A second order would strand the quote, the history and the payment on
    // the first one.
    expect(resumeSubmitPhase(true, false)).toBe("attaching");
  });

  it("does not bind the same file twice", () => {
    expect(resumeSubmitPhase(true, true)).toBe("sending");
  });
});
