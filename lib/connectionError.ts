/**
 * What a client reads when the phone could not talk to GRIDGO, and the filter
 * that keeps a platform's own error text off the screen.
 *
 * A failed request names the address it failed on. Android's fetch answers
 * `fetch failed: ... Unable to resolve host "<api host>"`, and Clerk answers
 * `Network error at "<url with its query string>"`. None of that helps a client
 * and an address travels with every screenshot, so the detail goes to the
 * developer log and the screen gets one sentence with one next step.
 *
 * No imports from the app: `lib/api.ts` and `lib/copy.ts` both read this.
 */

export const CONNECTION_ERROR_MESSAGE =
  "Cannot reach GRIDGO right now. Check your internet connection and try again.";

/** The request never got an answer. `message` is safe to show; `detail` is not. */
export class ConnectionError extends Error {
  readonly detail: unknown;
  constructor(detail?: unknown) {
    super(CONNECTION_ERROR_MESSAGE);
    this.name = "ConnectionError";
    this.detail = detail;
  }
}

/*
  The wording each platform's network stack uses. Android reports OkHttp and
  java.net text through expo/fetch ("fetch failed: ..."), iOS reports
  NSURLError descriptions, browsers report TypeError text.
*/
const CONNECTION_TEXT = new RegExp(
  [
    "network",
    "failed to fetch",
    "fetch failed",
    "load failed",
    "request timed out",
    "unable to resolve host",
    "failed to connect",
    "could not connect to the server",
    "hostname could not be found",
    "internet connection appears",
    "connection (?:refused|reset|abort|closed|lost|timed out)",
    "\\bsocket\\b",
    "\\b(?:econn[a-z]*|enotfound|etimedout)\\b",
    "\\berr_[a-z_]+\\b",
    "unknownhost",
    "\\bssl\\b",
    "handshake",
    "cleartext",
  ].join("|"),
  "i",
);

/* Text only a developer can use: an address, a runtime error, a status dump. */
const TECHNICAL_TEXT = new RegExp(
  [
    "https?://",
    "\\bwww\\.",
    "\\blocalhost\\b",
    "\\b\\d{1,3}(?:\\.\\d{1,3}){3}\\b",
    "\\b[a-z0-9-]+(?:\\.[a-z0-9-]+)*\\.(?:com|net|org|ph|io|dev|app)\\b",
    "\\b(?:type|reference|syntax|range)error\\b",
    "exception",
    "\\b(?:java|kotlin|okhttp3?)\\.",
    "\\bnsurl",
    "is not a function",
    "is not an object",
    "(?:undefined|null) is not",
    "of (?:undefined|null)\\b",
    "cannot read propert",
    "json parse",
    "unexpected (?:token|end of)",
    "\\bhttp \\d{3}\\b",
    "call to function",
    "\\bclerk(?:js)?:",
    "gridgo-api",
    "<html",
  ].join("|"),
  "i",
);

/** An email a person typed is not a leaked address. */
function withoutEmails(text: string): string {
  return text.replace(/\S+@\S+/g, "");
}

export function isConnectionFailureText(text: string): boolean {
  return CONNECTION_TEXT.test(withoutEmails(text));
}

/** Includes a request deadline, which already carries the one message. */
export function isConnectionFailure(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return error.message === CONNECTION_ERROR_MESSAGE || isConnectionFailureText(error.message);
}

/**
 * Text from an error, fit for a client to read: a connection failure becomes
 * the one message, anything else technical becomes the caller's fallback, and
 * a sentence somebody wrote for a client passes through.
 */
export function safeErrorText(text: string, fallback: string): string {
  if (isConnectionFailureText(text)) {
    noteForDevelopers("connection failure", text);
    return CONNECTION_ERROR_MESSAGE;
  }
  if (TECHNICAL_TEXT.test(withoutEmails(text))) {
    noteForDevelopers("hidden error text", text);
    return fallback;
  }
  return text;
}

/** The detail the screen no longer shows. Dev builds only: a release logs nothing. */
export function noteForDevelopers(context: string, detail: unknown): void {
  if (__DEV__) console.log(`[connection] ${context}:`, detail);
}
