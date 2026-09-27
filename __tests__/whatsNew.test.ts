import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, mkdirSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

import { parseWhatsNew, WHATS_NEW_LIMITS } from "@/lib/appUpdate";

// Plain Node, so CI runs it without a build step; see the file's header.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const whatsNew = require("../scripts/whats-new.js") as {
  HISTORY_MARKER: string;
  MAX_CHARS: number;
  noteProblem: (lines: string[]) => string | null;
  pendingNotes: (root: string) => { file: string; text: string }[];
  recordRelease: (root: string, version: string) => number;
  releaseSection: (notes: { text: string }[]) => string;
};

const repo = join(__dirname, "..");
let root: string;

function note(name: string, body: string) {
  writeFileSync(join(root, "whats-new", name), body);
}

// A fixture of its own, never a copy of the repository's files: CI files every
// real release into WHATS_NEW.md, so a copy would carry that history into the
// assertions below.
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "whats-new-"));
  mkdirSync(join(root, "whats-new"));
  writeFileSync(join(root, "WHATS_NEW.md"), `# What's new\n\n${whatsNew.HISTORY_MARKER}\n`);
  writeFileSync(join(root, "whats-new", "README.md"), "# Pending notes\n");
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("the notes waiting in this repository", () => {
  it("are all well formed, so the release step cannot fail on one", () => {
    expect(() => whatsNew.pendingNotes(repo)).not.toThrow();
  });

  it("fit the app's own limit, so a phone shows them whole", () => {
    expect(whatsNew.MAX_CHARS).toBe(WHATS_NEW_LIMITS.maxChars);
  });

  it("keep the marker CI files each release under", () => {
    expect(readFileSync(join(repo, "WHATS_NEW.md"), "utf8")).toContain(whatsNew.HISTORY_MARKER);
  });
});

describe("a pending note", () => {
  it("is one plain bullet", () => {
    expect(whatsNew.noteProblem(["- Faster checkout"])).toBeNull();
    expect(whatsNew.noteProblem([])).toMatch(/one line/);
    expect(whatsNew.noteProblem(["- One", "- Two"])).toMatch(/one line/);
    expect(whatsNew.noteProblem(["Faster checkout"])).toMatch(/bullet/);
    expect(whatsNew.noteProblem(["- " + "x".repeat(121)])).toMatch(/121 characters/);
    expect(whatsNew.noteProblem(["- See https://example.com"])).toMatch(/plain words/);
    expect(whatsNew.noteProblem(["- Fixed `parseWhatsNew`"])).toMatch(/plain words/);
    expect(whatsNew.noteProblem(["- [Docs](docs/x.md)"])).toMatch(/plain words/);
  });

  it("names its own file when it is not", () => {
    note("200-bad.md", "Faster checkout\n");
    expect(() => whatsNew.pendingNotes(root)).toThrow("whats-new/200-bad.md must be one bullet");
  });
});

describe("the release body", () => {
  it("lists pending notes by pull request number, and the app reads them back", () => {
    note("9-first.md", "- First\n");
    note("108-second.md", "- Second\n");
    note("1000-third.md", "- Third\n");
    const section = whatsNew.releaseSection(whatsNew.pendingNotes(root));
    expect(section).toBe("## What's new\n\n- First\n- Second\n- Third\n");
    const body = `${section}\n## Build\n\nSigned release APK for sideloading (123M).\n`;
    expect(parseWhatsNew(body)).toEqual(["First", "Second", "Third"]);
  });

  it("has no section when nothing is pending, and the app falls back", () => {
    expect(whatsNew.releaseSection(whatsNew.pendingNotes(root))).toBe("");
    expect(parseWhatsNew("## Build\n\nSigned release APK for sideloading (123M).")).toEqual([]);
  });
});

describe("recording a release", () => {
  it("files the notes under the version, newest release first, and clears them", () => {
    note("108-a.md", "- Old change\n");
    expect(whatsNew.recordRelease(root, "1.0.123")).toBe(1);
    note("111-b.md", "- New change\n");
    expect(whatsNew.recordRelease(root, "1.0.124")).toBe(1);

    const history = readFileSync(join(root, "WHATS_NEW.md"), "utf8");
    const after = history.slice(history.indexOf(whatsNew.HISTORY_MARKER));
    expect(after).toBe(
      `${whatsNew.HISTORY_MARKER}\n\n## 1.0.124\n\n- New change\n\n## 1.0.123\n\n- Old change\n`,
    );
    expect(readdirSync(join(root, "whats-new"))).toEqual(["README.md"]);
  });

  it("records nothing twice for one version", () => {
    note("108-a.md", "- A change\n");
    whatsNew.recordRelease(root, "1.0.123");
    note("109-b.md", "- Another\n");
    expect(whatsNew.recordRelease(root, "1.0.123")).toBe(0);
    expect(readdirSync(join(root, "whats-new")).sort()).toEqual(["109-b.md", "README.md"]);
  });

  it("does nothing when nothing is pending", () => {
    const before = readFileSync(join(root, "WHATS_NEW.md"), "utf8");
    expect(whatsNew.recordRelease(root, "1.0.123")).toBe(0);
    expect(readFileSync(join(root, "WHATS_NEW.md"), "utf8")).toBe(before);
  });

  it("refuses a version CI would not have written", () => {
    expect(() => whatsNew.recordRelease(root, "latest")).toThrow(/not a release version/);
  });
});
