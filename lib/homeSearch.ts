import { categoryShortName } from "@/lib/categoryLook";
import {
  normalizeSearch,
  searchSubcategories,
  SEARCH_MIN_CHARS,
  type ProductCategory,
  type ProductSubcategory,
} from "@/lib/productCategories";

/**
 * Home's inline search: the same search as the picker, cut to a dropdown.
 *
 * There is one search in this app — `searchSubcategories` over names, examples
 * and the family's own words — and this reads it rather than keeping a second
 * index. What Home adds is only what a dropdown needs: a cap, so the list fits
 * above a phone keyboard, the count behind the cap, so "See all" can say what
 * it leads to, and for each row the reason it matched in the client's words.
 *
 * Name matches come first because the search already ranks them first. A row
 * that matched through one of its examples ("tote" → Custom apparel) names that
 * example, because the subcategory name alone does not say why it is here.
 */

/** Rows a dropdown shows before it hands over to the full search. */
export const HOME_SEARCH_LIMIT = 5;

export type HomeSearchRow = {
  category: ProductCategory;
  subcategory: ProductSubcategory;
  /** The line under the name: the example that matched, else the family. */
  caption: string;
};

export type HomeSearch = {
  /** False below the minimum length: the dropdown stays closed. */
  searching: boolean;
  rows: HomeSearchRow[];
  /** Every match, including the ones past the cap. */
  total: number;
};

export function homeSearch(
  categories: ProductCategory[],
  query: string,
  limit = HOME_SEARCH_LIMIT,
): HomeSearch {
  const searching = normalizeSearch(query).length >= SEARCH_MIN_CHARS;
  if (!searching) return { searching, rows: [], total: 0 };

  const hits = searchSubcategories(categories, query);
  const rows = hits.slice(0, limit).map(({ category, subcategory }) => {
    const example = normalizeSearch(subcategory.name).includes(normalizeSearch(query))
      ? null
      : matchedExample(subcategory, query);
    return {
      category,
      subcategory,
      caption: example ? `Includes ${lowerFirst(example)}` : categoryShortName(category),
    };
  });

  return { searching, rows, total: hits.length };
}

/** The one example of a subcategory that the query found, as written. */
export function matchedExample(subcategory: ProductSubcategory, query: string): string | null {
  const needle = normalizeSearch(query);
  if (!needle) return null;
  const examples = subcategory.examples.split(",").map((entry) => entry.trim());
  return examples.find((entry) => normalizeSearch(entry).includes(needle)) ?? null;
}

/**
 * Split text around the part the client typed, for setting it in bold.
 *
 * A plain case-insensitive find on the text as written. Where the search
 * matched only after punctuation was folded away ("x stand" against
 * "x-stands"), there is nothing to embolden and the text is returned whole.
 */
export function splitMatch(
  text: string,
  query: string,
): { before: string; match: string; after: string } | null {
  const needle = query.trim().toLowerCase();
  if (!needle) return null;
  const at = text.toLowerCase().indexOf(needle);
  if (at < 0) return null;
  return {
    before: text.slice(0, at),
    match: text.slice(at, at + needle.length),
    after: text.slice(at + needle.length),
  };
}

/** What a screen reader hears once the results settle. */
export function homeSearchAnnouncement(search: HomeSearch, query: string): string {
  const typed = query.trim();
  if (!search.total) return `No matches for ${typed}`;
  if (search.total === 1) return `1 match for ${typed}`;
  if (search.total > search.rows.length) {
    return `${search.total} matches for ${typed}, showing ${search.rows.length}`;
  }
  return `${search.total} matches for ${typed}`;
}

function lowerFirst(text: string): string {
  // "T-shirts" stays as written; only a capitalised common word is lowered.
  if (/^[A-Z][a-z]/.test(text)) return text.charAt(0).toLowerCase() + text.slice(1);
  return text;
}
