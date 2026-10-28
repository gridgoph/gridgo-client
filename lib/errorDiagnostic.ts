/**
 * What a crash is allowed to say about itself, on screen and in the device log.
 *
 * A render error's message can carry whatever the code had in hand: a signed
 * file link, a request's `Authorization` header, a session token. A recovery
 * screen prints it so a screenshot names the cause, and a screenshot travels —
 * so the text is redacted and bounded first, keeping the error's type and the
 * words that say what went wrong.
 */

/** Long enough to name the cause; short enough that the buttons stay in view. */
export const DIAGNOSTIC_MAX_CHARS = 300;
/** Stack frames kept in the device log. */
export const DIAGNOSTIC_STACK_LINES = 12;

const REDACTED = "[redacted]";

type Replacement = string | ((match: string, ...groups: string[]) => string);

/** Key names whose value is a credential, however the pair is written (`oauth2Token`, `auth.password`). */
const SECRET_KEY =
  "[A-Za-z0-9_.-]*(?:token|signature|secret|password|passwd|credential|api[-_]?key|session|authorization|cookie)[A-Za-z0-9_-]*";
const SECRET_KEY_NAME = new RegExp(`^${SECRET_KEY}$`, "i");

/*
  Order matters: a Cookie header loses its whole value (every pair, not only
  the first) and an Authorization header its value, scheme included, before
  the bare-bearer rule runs; a URL loses its query before key/value pairs are
  looked for, so a signed link reads `https://host/path?[redacted]`. A value
  already reading `[redacted]` is never matched again.
*/
const RULES: readonly [RegExp, Replacement][] = [
  [/\b(set-cookie|cookie)\b(\s*[:=]\s*)(?!\[redacted\])[^\r\n]+/gi, `$1$2${REDACTED}`],
  [/\b(proxy-authorization|authorization|x-api-key)\b(\s*[:=]\s*)(?:(?:bearer|basic|token)\s+)?[^\s,;"'&]+/gi, `$1$2${REDACTED}`],
  [/\bbearer\s+[A-Za-z0-9._~+/=-]+/gi, `Bearer ${REDACTED}`],
  [/\b(https?:\/\/[^\s?#"'<>]+)\?[^\s#"'<>]*/gi, `$1?${REDACTED}`],
  [/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]*)?/g, REDACTED],
  [/\b(?:sk|pk|rk|tok|whsec)_[A-Za-z0-9_]{8,}/g, REDACTED],
  // `token=x`, `password: x`, `"token":"x"` (JSON), `\"token\":\"x\"` (JSON
  // inside a JSON string) and `'token': 'x'`: the value goes, its quotes stay.
  // An object or array under such a key goes whole, if it holds no other.
  [
    new RegExp(
      `(\\\\?["']?)\\b(${SECRET_KEY})\\1(\\s*[:=]\\s*)(\\\\"[^"]*\\\\"|"(?:[^"\\\\]|\\\\.)*"|'(?:[^'\\\\]|\\\\.)*'|\\{[^{}]*\\}|\\[[^[\\]]*\\]|[^\\s&"',;{}\\[\\]]+)`,
      "gi",
    ),
    (_match, quote, key, separator, value) => {
      const wrap = /^\\?["']/.exec(value)?.[0] ?? "";
      return `${quote}${key}${quote}${separator}${wrap}${REDACTED}${wrap}`;
    },
  ],
  // An opaque run long enough to be a key; no `/`, so a file path in a stack survives.
  [/[A-Za-z0-9_-]{40,}={0,2}/g, REDACTED],
];

/** The same text with credentials, tokens and signed link queries taken out. */
export function redactDiagnostic(text: string): string {
  return RULES.reduce(
    // Two calls: TypeScript picks a `replace` overload per type, not for the union.
    (out, [pattern, replacement]) =>
      typeof replacement === "string" ? out.replace(pattern, replacement) : out.replace(pattern, replacement),
    text,
  );
}

function bound(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

function errorParts(error: unknown): { name: string; message: string; stack: string | null } {
  if (error instanceof Error) {
    return { name: error.name || "Error", message: error.message ?? "", stack: error.stack ?? null };
  }
  let message: string;
  try {
    // By key, at every depth: a credential held as an object or array goes too.
    message =
      typeof error === "string"
        ? error
        : (JSON.stringify(error, (key, value: unknown) => (key && SECRET_KEY_NAME.test(key) ? REDACTED : value)) ??
          String(error));
  } catch {
    message = String(error);
  }
  return { name: "Thrown value", message, stack: null };
}

/**
 * One line for the screen: `TypeError: Cannot read property 'label' of undefined`,
 * redacted, whitespace folded, at most `DIAGNOSTIC_MAX_CHARS`.
 */
export function diagnosticSummary(error: unknown): string {
  const { name, message } = errorParts(error);
  const words = redactDiagnostic(message).replace(/\s+/g, " ").trim();
  return bound(words ? `${name}: ${words}` : name, DIAGNOSTIC_MAX_CHARS);
}

/** The summary plus the first stack frames, redacted, for `console.error`. */
export function diagnosticLog(error: unknown): string {
  const summary = diagnosticSummary(error);
  const { stack } = errorParts(error);
  if (!stack) return summary;
  const frames = stack
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^at\s|@/.test(line))
    .slice(0, DIAGNOSTIC_STACK_LINES)
    .map((line) => bound(redactDiagnostic(line), 240));
  return frames.length ? `${summary}\n${frames.join("\n")}` : summary;
}
