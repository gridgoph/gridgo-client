/**
 * Hunting one category's samples.
 *
 * The parent picker already searches the whole tree. This is the same job
 * inside a category: a client who typed "tote" on Custom apparel should see
 * that tile, not a wall that ignores the words they just used.
 */

import type { CatalogItem } from "@/lib/api";
import type { ProductSubcategory } from "@/lib/productCategories";

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** True when the hunt is long enough to mean something. */
export function isHunting(hunt: string): boolean {
  return normalize(hunt).length >= 2;
}

/**
 * Does this subcategory (and the listing GRIDGO would quote for it) match
 * what the client typed — name, examples, or the sample's own name.
 */
export function subcategoryMatchesHunt(
  subcategory: ProductSubcategory,
  listing: CatalogItem | null,
  hunt: string,
): boolean {
  if (!isHunting(hunt)) return true;
  const needle = normalize(hunt);
  const hay = [
    subcategory.name,
    subcategory.examples,
    listing?.name ?? "",
    listing?.description ?? "",
  ].join(" ");
  return normalize(hay).includes(needle);
}
