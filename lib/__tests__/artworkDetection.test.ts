import type { DetectedArtwork } from "@/lib/api";
import {
  detectedPageQuantity,
  detectedProportions,
  detectedSummary,
  pageQuantityOffer,
} from "@/lib/artworkUpload";

function read(overrides: Partial<DetectedArtwork> = {}): DetectedArtwork {
  return {
    kind: "pdf",
    pageCount: 1,
    pixelWidth: null,
    pixelHeight: null,
    dpi: null,
    measureUnit: "mm",
    widthMilli: 210000,
    heightMilli: 297000,
    pageSize: "A4",
    orientation: "portrait",
    ...overrides,
  };
}

describe("what the client is told the file is", () => {
  it("leads with the name a person would recognise", () => {
    expect(detectedSummary(read())).toBe("A4");
  });

  it("says landscape, and does not say portrait", () => {
    // Orientation earns its words only where it distinguishes something.
    // "A4 portrait" on every upright page is noise.
    expect(detectedSummary(read({ orientation: "landscape" }))).toBe("A4 landscape");
  });

  it("counts pages only when there is more than one", () => {
    expect(detectedSummary(read({ pageCount: 10 }))).toBe("A4 · 10 pages");
    expect(detectedSummary(read({ pageCount: 1 }))).toBe("A4");
  });

  it("falls back to the measurement when the size has no name", () => {
    const summary = detectedSummary(
      read({ pageSize: null, widthMilli: 500000, heightMilli: 700000 }),
    );
    expect(summary).toBe("500 × 700 mm");
  });

  it("says pixels when no density was declared, rather than implying a paper size", () => {
    // The honest answer for a screenshot. Reporting a physical size here would
    // be GRIDGO inventing the density the file refused to state.
    const summary = detectedSummary(
      read({
        kind: "raster",
        pageSize: null,
        measureUnit: null,
        widthMilli: null,
        heightMilli: null,
        pixelWidth: 1080,
        pixelHeight: 1920,
      }),
    );
    expect(summary).toBe("1080 × 1920 pixels");
  });

  it("says nothing at all when the file said nothing", () => {
    expect(detectedSummary(null)).toBeNull();
  });
});

describe("proportions for the size warning", () => {
  it("prefers the printed size over the pixel count", () => {
    const proportions = detectedProportions(read({ pixelWidth: 100, pixelHeight: 100 }));
    expect(proportions).toEqual({ width: 210000, height: 297000 });
  });

  it("uses pixels when there is no physical size, because a ratio survives either way", () => {
    const proportions = detectedProportions(
      read({ widthMilli: null, heightMilli: null, pixelWidth: 800, pixelHeight: 600 }),
    );
    expect(proportions).toEqual({ width: 800, height: 600 });
  });

  it("returns nothing rather than half a measurement", () => {
    expect(detectedProportions(read({ widthMilli: 210000, heightMilli: null }))).toBeNull();
    expect(detectedProportions(null)).toBeNull();
  });
});

describe("the page-count offer on a per-page listing", () => {
  it("offers the file's page count when the quantity does not match", () => {
    const offer = pageQuantityOffer(read({ pageCount: 10 }), "per_page", 1);
    expect(offer?.pages).toBe(10);
    expect(offer?.message).toContain("10 pages");
  });

  it("stays quiet when the quantity already matches", () => {
    expect(pageQuantityOffer(read({ pageCount: 10 }), "per_page", 10)).toBeNull();
  });

  it("stays quiet on a listing that is not priced by the page", () => {
    // A stack of flyers is not one flyer per page of the artwork, and offering
    // to set 500 flyers to 2 because the PDF has two pages is nonsense.
    expect(pageQuantityOffer(read({ pageCount: 2 }), "per_unit", 500)).toBeNull();
    expect(pageQuantityOffer(read({ pageCount: 2 }), "per_package", 5)).toBeNull();
  });

  it("does not count pages for an image", () => {
    // An image is one page and does not need saying.
    expect(detectedPageQuantity(read({ kind: "raster", pageCount: 1 }))).toBeNull();
  });

  it("stays quiet when the file would not say how many pages it has", () => {
    expect(pageQuantityOffer(read({ pageCount: null }), "per_page", 1)).toBeNull();
  });
});
