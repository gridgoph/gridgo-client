/**
 * Sending a print request is three server calls, not one.
 *
 * The job is created as a draft, the artwork is bound to it, and only then is
 * it sent for QA — so Operations never opens a job whose file has not landed.
 * On a Davao mobile connection with a 100 MB artwork the middle step is the
 * long one, and a single "Sending…" for all three tells the client nothing
 * about whether anything is happening or how much is left.
 *
 * The phase is named here rather than in the screen so the wording is one
 * decision in one place, and so it can be read back in a test.
 */

export type SubmitPhase = "creating" | "attaching" | "sending";

/** What is running right now, in the client's words. */
export function submitPhaseLabel(phase: SubmitPhase): string {
  switch (phase) {
    case "creating":
      return "Creating your job";
    case "attaching":
      return "Attaching your artwork";
    case "sending":
      return "Sending it for artwork check";
  }
}

/** Why this step takes the time it takes. One line, no apology. */
export function submitPhaseBody(phase: SubmitPhase): string {
  switch (phase) {
    case "creating":
      return "Saving the specification you entered.";
    case "attaching":
      return "Your file is uploading to this job. Large artwork takes a moment.";
    case "sending":
      return "Operations checks the file against the specification next.";
  }
}

/**
 * The phase to resume from when a send is retried.
 *
 * A retry must never create a second job or bind the same file twice — the
 * quote, the history and the payment all live on the first one.
 */
export function resumeSubmitPhase(
  orderCreated: boolean,
  artworkAttached: boolean,
): SubmitPhase {
  if (!orderCreated) return "creating";
  if (!artworkAttached) return "attaching";
  return "sending";
}
