import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * A measuring safe-area view reports 0 on the first frame of a native stack
 * push or a first tab mount, which is the header flick. Insets belong on
 * `useSafeAreaInsets` padding in `Screen`. This reads the source because
 * Jest cannot see the first-frame layout jump.
 */

const ROOTS = ["app", "components"];
const SOURCE = /\.tsx$/;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return SOURCE.test(entry) ? [path] : [];
  });
}

const files = ROOTS.flatMap((root) => sourceFiles(join(__dirname, "../..", root))).filter(
  (file) => !file.includes("__tests__"),
);

describe("screen shell", () => {
  it("finds source to check", () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it("never hands a className to SafeAreaView", () => {
    const offenders = files.flatMap((file) => {
      const source = readFileSync(file, "utf8");
      const hits = source.match(/<SafeAreaView[^>]*className=/gs) ?? [];
      return hits.length ? [file] : [];
    });
    expect(offenders).toEqual([]);
  });

  it("opens every screen with the shared shell rather than a raw SafeAreaView", () => {
    const offenders = files.filter((file) => {
      const source = readFileSync(file, "utf8");
      return (
        /import\s*\{[^}]*\bSafeAreaView\b/.test(source) || /<SafeAreaView[\s>]/.test(source)
      );
    });
    expect(offenders).toEqual([]);
  });

  it("reads insets in the shell instead of measuring them", () => {
    const source = readFileSync(join(__dirname, "..", "Screen.tsx"), "utf8");
    expect(source).toContain("useSafeAreaInsets");
    expect(source).not.toMatch(/import\s*\{[^}]*\bSafeAreaView\b/);
    expect(source).not.toMatch(/<SafeAreaView[\s>]/);
  });

  it("seeds the provider so frame one already has the phone's insets", () => {
    const source = readFileSync(join(__dirname, "../../app/_layout.tsx"), "utf8");
    expect(source).toContain("initialWindowMetrics");
    expect(source).toContain("initialMetrics={initialWindowMetrics}");
  });
});
