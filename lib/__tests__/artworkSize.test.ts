import type { DetectedArtwork } from "@/lib/api";
import { artworkSizeNote } from "@/lib/artworkSize";
import { physicalSizeMilli } from "@/lib/printResolution";

function image(pixelWidth: number, pixelHeight: number, dpi: number | null = null): DetectedArtwork {
  const milli = (pixels: number) => (dpi ? Math.round((pixels / dpi) * 25.4 * 1000) : null);
  return {
    kind: "raster",
    pageCount: 1,
    pixelWidth,
    pixelHeight,
    dpi,
    measureUnit: dpi ? "mm" : null,
    widthMilli: milli(pixelWidth),
    heightMilli: milli(pixelHeight),
    pageSize: null,
    orientation: pixelWidth > pixelHeight ? "landscape" : "portrait",
  };
}

function pdf(widthMilli: number, heightMilli: number): DetectedArtwork {
  return {
    kind: "pdf",
    pageCount: 1,
    pixelWidth: null,
    pixelHeight: null,
    dpi: null,
    measureUnit: "mm",
    widthMilli,
    heightMilli,
    pageSize: null,
    orientation: widthMilli > heightMilli ? "landscape" : "portrait",
  };
}

const note = (detected: DetectedArtwork | null, label: string, pixels?: { width: number; height: number }) =>
  artworkSizeNote({ detected, pixels, sizeMilli: physicalSizeMilli(label), label });

describe("an image that matches the chosen size", () => {
  it("says nothing about an A4 file exported at A4", () => {
    expect(note(image(2480, 3508, 300), "A4")).toBeNull();
  });

  it("judges pixels, not the millimetres a 72 DPI header works out to", () => {
    // 2480 × 3508 at a declared 72 DPI is 875 mm tall on paper and a perfect A4 file.
    expect(note(image(2480, 3508, 72), "A4")).toBeNull();
  });

  it("does not count which way up the design is", () => {
    expect(note(image(3508, 2480), "A4")).toBeNull();
  });

  it("allows for bleed and a file that is only a little soft", () => {
    // A 3 mm bleed on A5 moves the shape by about 2%.
    expect(note(image(1819, 2551), "A5")).toBeNull();
    // 150 DPI on A4 prints a little soft; the upload card says so quietly.
    expect(note(image(1240, 1754), "A4")).toBeNull();
  });
});

describe("an image that does not match", () => {
  it("gives both sizes for a phone screenshot sent for an A5 flyer", () => {
    expect(note(image(1080, 1920), "A5")).toEqual({
      needs: "A5 · 148 × 210 mm · about 1748 × 2480 pixels",
      file: "1080 × 1920 pixels",
      message:
        "It is a different shape, so it will be scaled to fit: part of the design may be cut " +
        "off, or a white border left. Upload a file that matches, or carry on and it will be " +
        "printed scaled to fit.",
    });
  });

  it("says when the shape is right but there are too few pixels", () => {
    const result = note(image(595, 842), "A4");
    expect(result?.needs).toBe("A4 · 210 × 297 mm · about 2480 × 3508 pixels");
    expect(result?.file).toBe("595 × 842 pixels");
    expect(result?.message).toContain("too few pixels for this size");
    expect(result?.message).toContain("print blurry");
    expect(result?.message).not.toContain("different shape");
  });

  it("names both problems when the file has both", () => {
    const result = note(image(320, 320), "A4");
    expect(result?.message).toContain("different shape and has too few pixels");
  });

  it("turns the product the way the file is, so the rows compare like with like", () => {
    expect(note(image(842, 595), "A4")?.needs).toBe("A4 · 297 × 210 mm · about 3508 × 2480 pixels");
  });

  it("reads a business card's size code", () => {
    const result = artworkSizeNote({
      detected: image(720, 1600, 96),
      sizeMilli: physicalSizeMilli("standard", { subcategoryCode: "business_cards" }),
      label: "standard",
    });
    expect(result?.needs).toBe("Standard · 50.8 × 88.9 mm · about 600 × 1050 pixels");
    expect(result?.file).toBe("720 × 1600 pixels");
  });

  it("describes a measured banner with no size label in centimetres", () => {
    const result = artworkSizeNote({
      detected: image(1080, 1080),
      sizeMilli: { width: 914_400, height: 1_524_000 },
      label: "",
    });
    expect(result?.needs).toBe("91.4 × 152.4 cm · about 3600 × 6000 pixels");
  });

  it("uses the phone's own measurement when GRIDGO could not read the file", () => {
    expect(note(null, "A5", { width: 1920, height: 1080 })?.file).toBe("1920 × 1080 pixels");
    expect(note(null, "A5", { width: 1748, height: 2480 })).toBeNull();
  });
});

describe("a PDF", () => {
  it("is judged on its page, which is a real size", () => {
    expect(note(pdf(210_000, 297_000), "A4")).toBeNull();
    expect(note(pdf(297_000, 210_000), "A4")).toBeNull();
  });

  it("says a smaller page of the same shape will be scaled", () => {
    expect(note(pdf(148_000, 210_000), "A4")).toEqual({
      needs: "A4 · 210 × 297 mm",
      file: "148 × 210 mm page",
      message:
        "The page is a different size, so it will be scaled to fit. Upload a file that " +
        "matches, or carry on and it will be printed scaled to fit.",
    });
  });

  it("adds the crop when the page is a different shape too", () => {
    expect(note(pdf(210_000, 210_000), "A4")?.message).toContain("cut off");
  });
});

describe("when either half is unknown", () => {
  it("stays quiet rather than inventing a size", () => {
    expect(note(image(1920, 1080), "Custom")).toBeNull();
    expect(note(null, "A4")).toBeNull();
    expect(note(pdf(148_000, 210_000), "Custom")).toBeNull();
  });
});
