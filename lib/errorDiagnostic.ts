/**
 * What a crash is allowed to say about itself, on screen and in the device log.
 *
 * A render error's message can carry whatever the code had in hand: a signed
 * file link, a request's `Authorization` header, a session token. A screenshot
 * travels, and no pattern list catches every way a credential can be written,
 * so the screen never shows the message: only the error's type and the app
 * components it failed in (`diagnosticHeadline`), both plain identifiers.
 *
 * The device log — readable only over USB debugging on the client's own phone
 * — keeps the message, redacted and bounded as best as patterns can, with the
 * stack and component stack (`diagnosticLog`).
 */

/** Long enough to name the cause in the log. */
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

function frameLines(stack: string | null): string[] {
  if (!stack) return [];
  return stack
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^(at|in)\s|@/.test(line))
    .slice(0, DIAGNOSTIC_STACK_LINES)
    .map((line) => bound(redactDiagnostic(line), 240));
}

/**
 * React's component stack for a caught render error. React Native's root
 * error handler copies it onto the error itself (`componentStack`) in every
 * build, during the commit — after the fallback first draws, before its
 * effects run. Absent on web.
 */
function componentStackOf(error: unknown): string | null {
  if (typeof error !== "object" || error === null || !("componentStack" in error)) return null;
  const stack = (error as { componentStack?: unknown }).componentStack;
  return typeof stack === "string" ? stack : null;
}

/** The summary plus the first stack and component-stack frames, redacted, for `console.error`. */
export function diagnosticLog(error: unknown): string {
  const frames = frameLines(errorParts(error).stack);
  const components = frameLines(componentStackOf(error));
  return [
    diagnosticSummary(error),
    ...frames,
    ...(components.length ? ["Component stack:", ...components] : []),
  ].join("\n");
}

const IDENTIFIER = /^[A-Za-z_$][\w$]{0,39}$/;

/**
 * The error's type as an identifier (`TypeError`), never its message. A
 * custom name that is not a plain identifier reads `Error`.
 */
export function errorTypeName(error: unknown): string {
  if (!(error instanceof Error)) return "Thrown value";
  return IDENTIFIER.test(error.name) ? error.name : "Error";
}

/** React, React Native and library frames: true of every crash, so they name nothing. */
const FRAMEWORK_NAMES = new Set([
  "Activity", "Anonymous", "AppContainer", "Background", "CellRenderer", "DelayedFreeze", "FlatList",
  "ForwardRef", "Fragment", "Freeze", "Group", "Image", "ImageBackground", "InnerScreen", "Memo", "Modal",
  "Pressable", "Route", "SafeAreaView", "SceneView", "Screen", "ScrollView", "ScrollViewBase", "SectionList",
  "StrictMode", "Suspender", "Suspense", "Text", "TextImpl", "TouchableHighlight", "TouchableOpacity",
  "TouchableWithoutFeedback", "Try", "Unknown", "View", "Wrap", "Wrapper",
]);
const FRAMEWORK_PATTERN = /^(RCT|RNS|RNC|Animated|Virtualized|Keyboard|Gesture|Native)|Context|Provider|Consumer|Boundary|Navigator|Navigation/;

/**
 * The innermost app components in a component stack, innermost first: names
 * only — every frame's location, file path and query string is dropped.
 */
export function failedComponents(componentStack: string | null, max = 2): string[] {
  if (!componentStack) return [];
  const names: string[] = [];
  for (const line of componentStack.split("\n")) {
    const name = /^\s*(?:at|in)\s+([A-Za-z_$][\w$]*)/.exec(line)?.[1] ?? /^\s*([A-Za-z_$][\w$]*)@/.exec(line)?.[1];
    if (!name || !IDENTIFIER.test(name) || !/^[A-Z]/.test(name)) continue;
    if (FRAMEWORK_NAMES.has(name) || FRAMEWORK_PATTERN.test(name)) continue;
    if (names.at(-1) === name) continue;
    names.push(name);
    if (names.length === max) break;
  }
  return names;
}

/**
 * The one line the recovery screen shows: `TypeError in OptionGroupPicker,
 * inside ListingScreen`. Identifiers only — the message never appears.
 */
export function diagnosticHeadline(error: unknown): string {
  const type = errorTypeName(error);
  const [inner, outer] = failedComponents(componentStackOf(error));
  if (!inner) return type;
  return outer ? `${type} in ${inner}, inside ${outer}` : `${type} in ${inner}`;
}
