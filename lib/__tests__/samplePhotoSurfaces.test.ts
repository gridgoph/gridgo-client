import fs from "node:fs";
import path from "node:path";

/**
 * Match / listing gallery / checkout must all load samples through samplePhotoUri.
 * Reading downloadUrl (or the metadata url) at the call site is how the
 * match row and hero drifted into empty "No sample" plates.
 */
const SURFACES = [
  "components/TopPickCard.tsx",
  "components/OtherListingRow.tsx",
  // The listing sheet draws its samples through the gallery.
  "components/ListingGallery.tsx",
  "app/checkout.tsx",
] as const;

describe("sample photo surfaces", () => {
  for (const relative of SURFACES) {
    it(`${relative} uses samplePhotoUri for SamplePhoto`, () => {
      const source = fs.readFileSync(
        path.join(process.cwd(), relative),
        "utf8",
      );
      expect(source).toContain("samplePhotoUri");
      // Either inline at the SamplePhoto prop, or via a local derived from the helper.
      expect(
        /url=\{samplePhotoUri\(/.test(source) ||
          (/samplePhotoUri\(/.test(source) && /url=\{sample\}/.test(source)),
      ).toBe(true);
      expect(source).not.toMatch(
        /url=\{[^}]*photos\[[^\]]+\]\?\.downloadUrl/,
      );
    });
  }
});
