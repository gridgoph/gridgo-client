import { artworkRefusalOf } from "@/lib/checkout";
import { documentPagesSummary, pageRangeError } from "@/lib/documentPages";
import { productionSpecRows } from "@/lib/productionSpecs";
import type { ProductionItem } from "@/lib/api";

test("validates page ranges and allows blank to select all pages", () => {
  for (const range of ["", "1", "1-4, 7", "1-4, 3-6", " 2, 2 "]) expect(pageRangeError(range, 10)).toBeNull();
  for (const range of ["0", "11", "2-1", "-1", "1.5", "1,,2", "1-", "1-11"]) expect(pageRangeError(range, 10)).toBeTruthy();
});

test("summaries and production specs keep actual page numbers distinct from the count", () => {
  const documentPages = { total: 30, range: "1-4, 8", printed: 5 };
  expect(documentPagesSummary(documentPages)).toBe("Pages 1-4, 8 · 5 per copy");
  expect(documentPagesSummary({ total: 30, range: null, printed: 30 })).toBe("All 30 pages · 30 per copy");
  const item = { quantity: 2, measurement: { pages: 5 }, documentPages } as ProductionItem;
  expect(productionSpecRows(item)).toEqual(expect.arrayContaining([
    { label: "File pages", value: "30" }, { label: "Pages to print", value: "1-4, 8" }, { label: "Pages per copy", value: "5" },
  ]));
});

test("missing page counts send checkout back to artwork", () => {
  expect(artworkRefusalOf({ error: "document_page_count_required", lineId: "line1" }))
    .toEqual(expect.objectContaining({ lineId: "line1", message: expect.stringContaining("readable page count") }));
});
