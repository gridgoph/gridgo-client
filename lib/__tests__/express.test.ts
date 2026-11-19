import type { StoredFile } from "@/lib/api";
import {
  canTickLooksRight,
  changePrint,
  choicesKey,
  defaultPrint,
  expressFileProblem,
  expressWarnings,
  filePaper,
  looksRightHolds,
  openWarnings,
  printedPages,
  selectedPages,
  sortExpressShops,
  type ExpressChoices,
  type ExpressShop,
} from "@/lib/express";

function file(overrides: Partial<StoredFile> = {}, detected: Partial<NonNullable<StoredFile["detected"]>> = {}): StoredFile {
  return {
    fileId: "file_1",
    purpose: "artwork",
    originalFilename: "thesis.pdf",
    declaredContentType: "application/pdf",
    detectedContentType: "application/pdf",
    size: 120_000,
    ownerId: "client_1",
    state: "ready",
    createdAt: "2026-11-19T00:00:00.000Z",
    readyAt: "2026-11-19T00:00:00.000Z",
    references: [],
    detected: {
      kind: "pdf",
      pageCount: 12,
      pixelWidth: null,
      pixelHeight: null,
      dpi: null,
      measureUnit: "mm",
      widthMilli: 210_000,
      heightMilli: 297_000,
      pageSize: "A4",
      orientation: "portrait",
      colorMode: "grayscale",
      ...detected,
    },
    ...overrides,
  };
}

describe("file reading", () => {
  it("names A4, Letter as Short and 8.5 x 13 in as Long", () => {
    expect(filePaper(file().detected)).toBe("a4");
    expect(filePaper(file({}, { pageSize: "Letter", widthMilli: 216_000, heightMilli: 279_000 }).detected)).toBe("short");
    expect(filePaper(file({}, { pageSize: null, widthMilli: 215_900, heightMilli: 330_200 }).detected)).toBe("long");
    expect(filePaper(file({}, { pageSize: "A3", widthMilli: 297_000, heightMilli: 420_000 }).detected)).toBeNull();
  });

  it("defaults to the file's own paper, B&W, one side, fit to page", () => {
    const letter = file({}, { pageSize: "Letter", widthMilli: 216_000, heightMilli: 279_000 });
    expect(defaultPrint(letter)).toMatchObject({ paper: "short", colour: "bw", sides: "one", layout: "fit_to_paper", copies: 1, pageRange: null });
  });

  it("refuses a file whose pages were not counted", () => {
    expect(expressFileProblem(file())).toBeNull();
    expect(expressFileProblem(file({}, { pageCount: null }))).toMatch(/Pages could not be counted/);
    expect(expressFileProblem(file({ state: "pending" }))).toBe("Still uploading");
    const image = file({ detectedContentType: "image/png" }, { pageCount: null });
    expect(expressFileProblem(image)).toBeNull();
  });
});

describe("warnings", () => {
  it("warns when the paper differs from the file and offers the file's paper", () => {
    const pdf = file();
    const print = { ...defaultPrint(pdf), paper: "long" as const };
    const [warning] = expressWarnings(pdf, print);
    expect(warning.code).toBe("paper_size_mismatch");
    expect(warning.message).toBe("File is A4, printing on Long");
    expect(warning.fix).toEqual({ label: "Use A4", change: { paper: "a4" } });
  });

  it("warns without a fix when Express has no paper for the file", () => {
    const a3 = file({}, { pageSize: "A3", widthMilli: 297_000, heightMilli: 420_000 });
    const [warning] = expressWarnings(a3, defaultPrint(a3));
    expect(warning.code).toBe("paper_size_mismatch");
    expect(warning.fix).toBeNull();
  });

  it("warns about an RGB file printed in colour only", () => {
    const rgb = file({}, { colorMode: "rgb" });
    expect(expressWarnings(rgb, defaultPrint(rgb))).toEqual([]);
    const colour = { ...defaultPrint(rgb), colour: "colour" as const };
    expect(expressWarnings(rgb, colour).map((w) => w.code)).toEqual(["rgb_colour"]);
    expect(expressWarnings(file({}, { colorMode: "mixed" }), colour).map((w) => w.code)).toEqual(["rgb_colour"]);
    expect(expressWarnings(file({}, { colorMode: "cmyk" }), colour)).toEqual([]);
  });

  it("is quiet when nothing is known about the file's size", () => {
    const unknown = file({}, { pageSize: null, widthMilli: null, heightMilli: null });
    expect(expressWarnings(unknown, defaultPrint(unknown))).toEqual([]);
  });

  it("an accepted warning stops being open, and drops once it no longer applies", () => {
    const pdf = file();
    let print = changePrint(pdf, defaultPrint(pdf), { paper: "long" });
    expect(openWarnings(pdf, print)).toHaveLength(1);
    print = { ...print, acceptedWarnings: ["paper_size_mismatch"] };
    expect(openWarnings(pdf, print)).toHaveLength(0);
    print = changePrint(pdf, print, { paper: "a4" });
    expect(print.acceptedWarnings).toEqual([]);
  });
});

describe("Looks right tick", () => {
  const pdf = file();
  const base: ExpressChoices = { prints: [defaultPrint(pdf)], supplierId: "shop_1", fulfilment: "pickup", dropoff: null };

  it("holds only for the exact choices it was given on", () => {
    const key = choicesKey(base);
    expect(looksRightHolds(key, base)).toBe(true);
    expect(looksRightHolds(null, base)).toBe(false);
  });

  it.each([
    ["copies", { prints: [{ ...base.prints[0], copies: 2 }] }],
    ["pages", { prints: [{ ...base.prints[0], pageRange: "1-3" }] }],
    ["paper", { prints: [{ ...base.prints[0], paper: "short" as const }] }],
    ["colour", { prints: [{ ...base.prints[0], colour: "colour" as const }] }],
    ["sides", { prints: [{ ...base.prints[0], sides: "two" as const }] }],
    ["layout", { prints: [{ ...base.prints[0], layout: "actual_size_centered" as const }] }],
    ["note", { prints: [{ ...base.prints[0], note: "Staple" }] }],
    ["files", { prints: [...base.prints, { ...base.prints[0], fileId: "file_2" }] }],
    ["shop", { supplierId: "shop_2" }],
    ["fulfilment", { fulfilment: "delivery" as const, dropoff: { lat: 7, lng: 125 } }],
  ])("clears when %s changes", (_name, change) => {
    const key = choicesKey(base);
    expect(looksRightHolds(key, { ...base, ...change })).toBe(false);
  });

  it("ignores a delivery address while picking up", () => {
    const key = choicesKey(base);
    expect(looksRightHolds(key, { ...base, dropoff: { lat: 7, lng: 125 } })).toBe(true);
  });

  it("cannot be given while a warning is open", () => {
    const long = { ...defaultPrint(pdf), paper: "long" as const };
    expect(canTickLooksRight([pdf], [long])).toBe(false);
    expect(canTickLooksRight([pdf], [{ ...long, acceptedWarnings: ["paper_size_mismatch"] }])).toBe(true);
    expect(canTickLooksRight([pdf], [])).toBe(false);
  });
});

describe("pages", () => {
  it("counts a range, merging overlaps, and duplex keeps the count", () => {
    expect(selectedPages(12, null)).toBe(12);
    expect(selectedPages(12, "1-3, 5")).toBe(4);
    expect(selectedPages(12, "1-4, 3-6")).toBe(6);
    expect(selectedPages(12, "13")).toBe(0);
    expect(selectedPages(12, "x")).toBe(0);
    const print = { ...defaultPrint(file()), copies: 3, pageRange: "1-2", sides: "two" as const };
    expect(printedPages(12, print)).toBe(6);
  });
});

describe("shop sorting", () => {
  function shop(id: string, distanceMeters: number, rating: number | null, jobsAhead: number, isNew = false): ExpressShop {
    return {
      supplierId: id, catalogItemIds: [`item_${id}`], name: id, address: "", location: { lat: 7, lng: 125 },
      distanceMeters, rating: rating == null ? null : { average: rating, count: 10 }, jobsAhead,
      readyAt: null, isNew, busy: jobsAhead >= 3,
    };
  }
  const shops = [
    shop("a", 900, 4.9, 4),
    shop("b", 200, 4.1, 0),
    shop("c", 500, 4.6, 1),
    shop("n", 1500, null, 0, true),
  ];
  const ids = (rows: ExpressShop[]) => rows.map((row) => row.supplierId);

  it("nearest is strictly by distance, even with a New shop", () => {
    expect(ids(sortExpressShops(shops, "nearest"))).toEqual(["b", "c", "a", "n"]);
  });

  it("top rated puts the first New shop second", () => {
    expect(ids(sortExpressShops(shops, "top_rated"))).toEqual(["a", "n", "c", "b"]);
  });

  it("fewest jobs breaks ties by distance and puts the New shop second", () => {
    expect(ids(sortExpressShops(shops, "fewest_jobs"))).toEqual(["b", "n", "c", "a"]);
  });

  it("does not move a lone New shop or mutate the input", () => {
    const lone = [shop("n", 100, null, 0, true)];
    expect(ids(sortExpressShops(lone, "top_rated"))).toEqual(["n"]);
    const before = ids(shops);
    sortExpressShops(shops, "top_rated");
    expect(ids(shops)).toEqual(before);
  });
});

describe("layout thumbnail", () => {
  const { artworkBox } = jest.requireActual<typeof import("@/lib/express")>("@/lib/express");
  const a4 = { widthMilli: 210_000, heightMilli: 297_000 };

  it("fits inside the margin, centred", () => {
    const box = artworkBox("a4", "fit_to_paper", a4);
    expect(box.width).toBeCloseTo(0.9);
    expect(box.left).toBeCloseTo(0.05);
  });

  it("keeps actual size centred or top-left", () => {
    const centred = artworkBox("long", "actual_size_centered", a4);
    expect(centred.height).toBeCloseTo(297 / 330.2);
    expect(centred.top).toBeCloseTo((1 - 297 / 330.2) / 2);
    expect(artworkBox("long", "actual_size_original_position", a4)).toMatchObject({ left: 0, top: 0 });
  });
});
