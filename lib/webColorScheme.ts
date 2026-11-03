import type { ThemeName } from "@/constants/theme";

/**
 * The web build's in-app theme.
 *
 * `global.css` keeps the Dark tokens under `@media (prefers-color-scheme:
 * dark)`, and React Native Web's `Appearance` cannot be overridden, so on the
 * web a tap on the theme switch used to throw and the browser's setting always
 * won. Pinning a theme rewrites that media rule's condition instead: `all`
 * turns the Dark tokens on, `not all` turns them off, and following the system
 * puts the rule back as written. Every class that reads a token follows.
 */

const QUERY = "prefers-color-scheme: dark";

type RuleList = ArrayLike<CSSRule>;
type MediaRule = CSSRule & { media: MediaList; cssRules: RuleList };
type SheetSource = { styleSheets: ArrayLike<{ cssRules: RuleList }> };

/** Each rewritten rule's own condition, so following the system restores it. */
const written = new WeakMap<MediaList, string>();

function isMediaRule(rule: CSSRule): rule is MediaRule {
  return "media" in rule && typeof (rule as MediaRule).media?.mediaText === "string";
}

function rulesOf(sheet: { cssRules: RuleList }): RuleList | null {
  try {
    return sheet.cssRules;
  } catch {
    // Another origin's stylesheet: not ours to read.
    return null;
  }
}

function visit(rules: RuleList, pinned: ThemeName | null) {
  for (let index = 0; index < rules.length; index += 1) {
    const rule = rules[index];
    if (isMediaRule(rule)) {
      const original = written.get(rule.media) ?? rule.media.mediaText;
      if (original.includes(QUERY)) {
        written.set(rule.media, original);
        const next = pinned === "dark" ? "all" : pinned === "light" ? "not all" : original;
        if (rule.media.mediaText !== next) rule.media.mediaText = next;
      }
    }
    const inner = (rule as Partial<MediaRule>).cssRules;
    if (inner) visit(inner, pinned);
  }
}

/** Pin the web build to a theme, or follow the browser again with null. */
export function pinWebColorScheme(pinned: ThemeName | null, source?: SheetSource) {
  const doc = source ?? (typeof document === "undefined" ? null : document);
  if (!doc) return;
  for (let index = 0; index < doc.styleSheets.length; index += 1) {
    const rules = rulesOf(doc.styleSheets[index]);
    if (rules) visit(rules, pinned);
  }
}
