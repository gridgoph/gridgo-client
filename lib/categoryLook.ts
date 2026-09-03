/**
 * How a product category reads on Home's start menu.
 *
 * Two pure lookups, both keyed by the governed category code so a code the API
 * adds later falls back rather than guessing.
 *
 * **Short name.** The catalogue names are not menu labels: "Marketing &
 * promotional collateral" shipped truncated mid-word as "Marketing &
 * Promotional Colla…" when the menu was a two-up grid, and even on a
 * full-width row it wraps to two lines and crowds out the line that says what
 * is inside. A menu nobody can read is not a menu. The catalogue name stays
 * the accessible name and stays the heading on `app/request/[category].tsx`,
 * where the screen is wide enough to carry it — this is only the label the row
 * is set in.
 *
 * **Glyph.** A name is what you read; a glyph is what you find. Five identical
 * grey rectangles gave a client nothing to aim at, so each category carries a
 * mark of the thing itself. The names here are strings rather than components
 * so this module stays free of UI, the same split `lib/orderState.ts` keeps
 * with `StatusChip` — `HomeCategoryRow` owns the icon registry.
 */

import { canonicalCategoryCode, type ProductCategory } from "@/lib/productCategories";

export type CategoryGlyph = "megaphone" | "shirt" | "award" | "box" | "book" | "sheet";

const SHORT_NAME: Record<string, string> = {
  marketing_collateral: "Marketing",
  corporate_event_merch: "Merch & events",
  recognition_awards_signage: "Awards & signage",
  specialized_prototyping: "Prototyping",
  document_publication: "Documents",
};

const GLYPH: Record<string, CategoryGlyph> = {
  marketing_collateral: "megaphone",
  corporate_event_merch: "shirt",
  recognition_awards_signage: "award",
  specialized_prototyping: "box",
  document_publication: "book",
};

/** The label a board row is set in. Falls back to the catalogue name. */
export function categoryShortName(category: ProductCategory): string {
  return SHORT_NAME[canonicalCategoryCode(category.code)] ?? category.name;
}

/** The mark on the row's swatch. A category with no mark of its own gets a sheet. */
export function categoryGlyph(category: ProductCategory): CategoryGlyph {
  return GLYPH[canonicalCategoryCode(category.code)] ?? "sheet";
}

/**
 * What is inside a category, in the client's words.
 *
 * Two things it prints and then the size of the rest, because both facts
 * decide a tap: a client scanning for "tarpaulin" needs to see one it
 * recognises, and a client who sees only two names assumes that is all there
 * is. Written as a sentence rather than a dot-joined string — this is the one
 * line on the row a person actually reads, and the reason the menu is a
 * full-width board rather than a grid that cut it off.
 */
export function categoryExamples(category: ProductCategory): string {
  const names = category.subcategories.map((entry) => entry.name);
  if (!names.length) return "";
  if (names.length <= 2) return names.join(" and ");
  return `${names[0]}, ${names[1]} and ${names.length - 2} more`;
}
