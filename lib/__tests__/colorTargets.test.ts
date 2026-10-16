import { ApiError } from "@/lib/api";
import {
  EMPTY_DRAFT,
  artworkColorDetail,
  artworkColorLabel,
  artworkColorsView,
  checkDraft,
  cmykSwatchHex,
  colorFileNamer,
  colorTargetsOf,
  colorTargetsRefusal,
  draftFromTarget,
  parseCmyk,
  parseHex,
  parsePantone,
  spreadCmyk,
  swatchKind,
  swatchNote,
  targetFoundIn,
  targetInput,
  type ArtworkColorsEntry,
  type ColorDraft,
  type ColorTarget,
} from "@/lib/colorTargets";

/** gridgo-client#249: exact colours, checked the way gridgo-api checks them. */

const draft = (change: Partial<ColorDraft>): ColorDraft => ({ ...EMPTY_DRAFT, ...change });

describe("Pantone", () => {
  it.each([
    ["185 C", "PANTONE 185 C"],
    ["pms 201c", "PANTONE 201 C"],
    ["185C", "PANTONE 185 C"],
    ["Pantone® 185 C", "PANTONE 185 C"],
    ["warm red c", "PANTONE Warm Red C"],
    ["18-1663tpx", "PANTONE 18-1663 TPX"],
    ["PANTONE 18-1663 TCX", "PANTONE 18-1663 TCX"],
  ])("normalises %s as %s", (typed, stored) => {
    expect(parsePantone(typed)).toBe(stored);
  });

  it.each(["C", "", "1a5fb4", "185 C!", "x".repeat(41)])("refuses %j", (typed) => {
    expect(parsePantone(typed)).toBeNull();
  });

  it("is text only without an approximate hex, and an approximate swatch with one", () => {
    const plain = checkDraft(draft({ label: "Brand red", pantone: "pms 185c" }));
    expect(plain).toMatchObject({
      ok: true,
      input: { label: "Brand red", pantone: "pms 185c" },
      target: { value: "PANTONE 185 C", swatchHex: null, swatchApproximate: null },
    });
    if (!plain.ok) throw new Error("expected ok");
    expect(swatchKind(plain.target)).toBe("none");
    expect(swatchNote(plain.target)).toBe("Pantone code only, no swatch");

    const swatched = checkDraft(draft({ label: "School maroon", pantone: "201 C", approximateHex: "9d2235" }));
    expect(swatched).toMatchObject({
      ok: true,
      input: { pantone: "201 C", approximateHex: "#9D2235" },
      target: { value: "PANTONE 201 C", swatchHex: "#9D2235", swatchApproximate: true },
    });
    if (!swatched.ok) throw new Error("expected ok");
    expect(swatchNote(swatched.target)).toBe("Your approximate swatch");
  });

  it("refuses a bad approximate hex on its own field", () => {
    expect(checkDraft(draft({ label: "Maroon", pantone: "201 C", approximateHex: "#12" }))).toMatchObject({
      ok: false,
      field: "approximateHex",
    });
  });
});

describe("CMYK", () => {
  it.each([
    ["0 100 65 34"],
    ["0/100/65/34"],
    ["0, 100, 65, 34"],
    ["cmyk(0%, 100%, 65%, 34%)"],
    ["C0 M100 Y65 K34"],
    ["k:34 c:0 y=65 m=100"],
  ])("reads %s", (typed) => {
    expect(parseCmyk(typed)).toEqual({ c: 0, m: 100, y: 65, k: 34 });
  });

  it.each(["0 100 65", "0 100 65.5 34", "0 101 65 34", "C0 M100 Y65", "C0 C100 Y65 K34"])("refuses %s", (typed) => {
    expect(parseCmyk(typed)).toBeNull();
  });

  it("draws the plain screen formula, marked approximate", () => {
    expect(cmykSwatchHex({ c: 0, m: 100, y: 65, k: 34 })).toBe("#A8003B");
    expect(cmykSwatchHex({ c: 0, m: 0, y: 0, k: 0 })).toBe("#FFFFFF");
    const check = checkDraft(draft({ label: "Logo red", format: "cmyk", cmyk: { c: "0", m: "100", y: "65", k: "34%" } }));
    expect(check).toMatchObject({
      ok: true,
      input: { label: "Logo red", cmyk: { c: 0, m: 100, y: 65, k: 34 } },
      target: { value: "C0 M100 Y65 K34", swatchHex: "#A8003B", swatchApproximate: true },
    });
    if (!check.ok) throw new Error("expected ok");
    expect(swatchNote(check.target)).toBe("Approximate on screen");
  });

  it("refuses a decimal or a value over 100, and waits on an empty box", () => {
    expect(checkDraft(draft({ label: "x", format: "cmyk", cmyk: { c: "0", m: "100.5", y: "1", k: "1" } }))).toMatchObject({
      ok: false,
      field: "cmyk",
      incomplete: false,
    });
    expect(checkDraft(draft({ label: "x", format: "cmyk", cmyk: { c: "0", m: "", y: "1", k: "1" } }))).toMatchObject({
      ok: false,
      field: "cmyk",
      incomplete: true,
    });
  });

  it("spreads a whole CMYK pasted into one box, and leaves a plain number alone", () => {
    expect(spreadCmyk("0/100/65/34")).toEqual({ c: "0", m: "100", y: "65", k: "34" });
    expect(spreadCmyk("C0 M100 Y65 K34")).toEqual({ c: "0", m: "100", y: "65", k: "34" });
    expect(spreadCmyk("45")).toBeNull();
  });
});

describe("hex", () => {
  it.each([
    ["#1a5fb4", "#1A5FB4"],
    ["1A5FB4", "#1A5FB4"],
    ["#abc", "#AABBCC"],
  ])("stores %s as %s", (typed, stored) => {
    expect(parseHex(typed)).toBe(stored);
  });

  it.each(["#1A5FB4FF", "#12", "blue", "#GGGGGG"])("refuses %s", (typed) => {
    expect(parseHex(typed)).toBeNull();
  });

  it("is an exact screen colour", () => {
    const check = checkDraft(draft({ label: "Logo blue", format: "hex", hex: "1a5fb4" }));
    expect(check).toMatchObject({ ok: true, input: { label: "Logo blue", hex: "#1A5FB4" }, target: { swatchApproximate: false } });
    if (!check.ok) throw new Error("expected ok");
    expect(swatchNote(check.target)).toBe("Screen colour");
  });
});

describe("label", () => {
  it("is required, after the value", () => {
    expect(checkDraft(draft({ format: "hex", hex: "#000" }))).toMatchObject({ ok: false, field: "label", incomplete: true });
    expect(checkDraft(draft({ label: "   ", format: "hex", hex: "" }))).toMatchObject({ ok: false, field: "hex" });
  });

  it("is at most 40 characters", () => {
    expect(checkDraft(draft({ label: "x".repeat(41), format: "hex", hex: "#000" }))).toMatchObject({
      ok: false,
      field: "label",
      incomplete: false,
    });
  });
});

const SAVED: ColorTarget[] = [
  { label: "Brand red", format: "pantone", value: "PANTONE 185 C", cmyk: null, hex: null, swatchHex: null, swatchApproximate: null },
  { label: "Maroon", format: "pantone", value: "PANTONE 201 C", cmyk: null, hex: null, swatchHex: "#9D2235", swatchApproximate: true },
  { label: "Logo red", format: "cmyk", value: "C0 M100 Y65 K34", cmyk: { c: 0, m: 100, y: 65, k: 34 }, hex: null, swatchHex: "#A8003B", swatchApproximate: true },
  { label: "Logo blue", format: "hex", value: "#1A5FB4", cmyk: null, hex: "#1A5FB4", swatchHex: "#1A5FB4", swatchApproximate: false },
];

describe("saved targets", () => {
  it("go back to GRIDGO in the shape a write takes", () => {
    expect(SAVED.map(targetInput)).toEqual([
      { label: "Brand red", pantone: "PANTONE 185 C" },
      { label: "Maroon", pantone: "PANTONE 201 C", approximateHex: "#9D2235" },
      { label: "Logo red", cmyk: { c: 0, m: 100, y: 65, k: 34 } },
      { label: "Logo blue", hex: "#1A5FB4" },
    ]);
  });

  it("reopen in the editor as they were saved", () => {
    for (const target of SAVED) {
      const check = checkDraft(draftFromTarget(target));
      expect(check).toMatchObject({ ok: true, target: { value: target.value, swatchHex: target.swatchHex } });
    }
  });

  it("read as none on an API from before them", () => {
    expect(colorTargetsOf({})).toEqual([]);
    expect(colorTargetsOf(null)).toEqual([]);
  });
});

describe("GRIDGO's refusals", () => {
  const refusal = (field: string, reason: string) =>
    new ApiError(400, { error: "invalid_color_targets", message: "x", details: { field, reason } });

  it("name the colour they are about", () => {
    expect(colorTargetsRefusal(refusal("colorTargets[1].hex", "hex_invalid"), ["Red", "Logo blue"])).toBe(
      "Logo blue: Type a hex colour, such as #1A5FB4.",
    );
    expect(colorTargetsRefusal(refusal("colorTargets[2].cmyk", "cmyk_invalid"), [])).toBe(
      "Colour 3: Each of C, M, Y and K is a whole number from 0 to 100.",
    );
  });

  it("word an approximate hex as the Pantone's swatch", () => {
    expect(colorTargetsRefusal(refusal("colorTargets[0].approximateHex", "hex_invalid"), ["Maroon"])).toMatch(
      /^Maroon: Type the approximate colour as a hex value/,
    );
  });

  it("say the list limit plainly, and leave other errors alone", () => {
    expect(colorTargetsRefusal(refusal("colorTargets", "too_many"))).toBe("You can name up to 8 exact colours.");
    expect(colorTargetsRefusal(new ApiError(409, { error: "cart_not_found" }))).toBeNull();
    expect(colorTargetsRefusal(new Error("offline"))).toBeNull();
  });
});

const READ: ArtworkColorsEntry[] = [
  {
    fileId: "file_pdf",
    colors: {
      version: 1,
      status: "partial",
      reasons: ["embedded_images_not_read"],
      colors: [
        { kind: "spot", name: "PANTONE 185 C", space: "cmyk", cmyk: { c: 0, m: 91, y: 76, k: 6 }, hex: "#F0163A", uses: 3, shareBps: null },
        { kind: "process", name: null, space: "cmyk", cmyk: { c: 0, m: 100, y: 65, k: 34 }, hex: "#A8003B", uses: 2, shareBps: null },
      ],
    },
  },
  {
    fileId: "file_png",
    colors: {
      version: 1,
      status: "read",
      reasons: [],
      colors: [{ kind: "pixels", name: null, space: "rgb", cmyk: null, hex: "#1A5FB4", uses: null, shareBps: 2500 }],
    },
  },
  { fileId: "file_jpg", colors: { version: 1, status: "unknown", reasons: ["not_read_for_this_file_type"], colors: [] } },
];

describe("colours read from a file", () => {
  it("says an unread file in a sentence, never as an empty palette", () => {
    expect(artworkColorsView(READ[2].colors)).toEqual({
      kind: "unknown",
      headline: "We could not read the colours in this file",
      notes: ["GRIDGO does not read colours from this file type. A PDF or PNG can be read."],
    });
    expect(artworkColorsView(undefined)).toMatchObject({ kind: "unknown" });
  });

  it("says what a partial read left out", () => {
    expect(artworkColorsView(READ[0].colors)).toMatchObject({
      kind: "read",
      notes: ["Pictures placed in the PDF were not read."],
    });
  });

  it("names spot colours, CMYK values and pixel shares", () => {
    const [spot, process] = READ[0].colors.colors;
    expect(artworkColorLabel(spot)).toBe("PANTONE 185 C");
    expect(artworkColorDetail(spot)).toBe("Spot colour");
    expect(artworkColorLabel(process)).toBe("C0 M100 Y65 K34");
    expect(artworkColorDetail(READ[1].colors.colors[0])).toBe("25% of the image");
  });

  it("marks a target only where a file states it exactly", () => {
    expect(targetFoundIn(SAVED[0], READ)).toEqual(["file_pdf"]);
    expect(targetFoundIn(SAVED[1], READ)).toEqual([]);
    expect(targetFoundIn(SAVED[2], READ)).toEqual(["file_pdf"]);
    expect(targetFoundIn(SAVED[3], READ)).toEqual(["file_png"]);
  });

  it("names a file by its label, its upload name, or its place", () => {
    const name = colorFileNamer(
      [
        { kind: "file", fileId: "a", label: "Front" },
        { kind: "file", fileId: "b" },
        { kind: "file", fileId: "c" },
      ],
      (fileId) => (fileId === "b" ? "back.pdf" : null),
    );
    expect([name("a"), name("b"), name("c")]).toEqual(["Front", "back.pdf", "File 3"]);
  });
});
