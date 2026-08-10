/**
 * What the client is printing — the browsable product tree.
 *
 * This is a different thing from `lib/taxonomy.ts`. That file handles the
 * *production* categories (large format, offset, apparel) that decide which
 * materials and finishes a job may carry. This one handles the four
 * customer-facing categories and their subcategories: the language a business
 * uses to say what it wants made.
 *
 * `GET /taxonomy` owns the tree. `adaptProductCategories` is a deliberately
 * forgiving reader over that payload, because the API's field names are still
 * settling — it accepts the shapes the contract is likely to land in and falls
 * back to `PRODUCT_CATEGORY_SEED` when the payload carries no tree at all. When
 * the contract is published, narrow the aliases here; nothing else changes.
 */

import { PRODUCT_CATEGORY_SEED } from "@/data/productCategories";

export type ProductSubcategory = {
  code: string;
  name: string;
  /** The examples line: what this actually covers, in the client's words. */
  examples: string;
  /**
   * Catalog families that print this. Empty means GRIDGO makes it but the app
   * does not price it yet — which the screen says plainly rather than offering
   * an order that would be created against the wrong product.
   */
  productFamilyIds: string[];
};

export type ProductCategory = {
  code: string;
  name: string;
  /** The audience line. A client recognises their own use case in it. */
  bestFor: string;
  subcategories: ProductSubcategory[];
};

/* -------------------------------------------------------------------------- */
/* Reading the API payload                                                     */
/* -------------------------------------------------------------------------- */

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/** First non-empty string among the given keys. */
function pickString(source: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

/** First array among the given keys. */
function pickArray(source: Record<string, unknown>, keys: string[]): unknown[] {
  for (const key of keys) {
    if (Array.isArray(source[key])) return source[key] as unknown[];
  }
  return [];
}

function pickStringList(source: Record<string, unknown>, keys: string[]): string[] {
  return pickArray(source, keys).filter(
    (entry): entry is string => typeof entry === "string" && entry.trim().length > 0,
  );
}

function isActive(source: Record<string, unknown>): boolean {
  return source.active === undefined || source.active === true;
}

const SUBCATEGORY_KEYS = ["subcategories", "subCategories", "children", "items"];
const EXAMPLES_KEYS = ["examples", "exampleText", "example", "examplesText"];
const BEST_FOR_KEYS = ["bestFor", "audience", "bestForText", "description"];
const FAMILY_KEYS = ["productFamilyIds", "productFamilies", "families", "familyIds"];

function adaptSubcategory(raw: unknown): ProductSubcategory | null {
  const source = asRecord(raw);
  if (!source || !isActive(source)) return null;

  const code = pickString(source, ["code", "id", "slug"]);
  const name = pickString(source, ["name", "label", "title"]);
  if (!code || !name) return null;

  return {
    code,
    name,
    examples: pickString(source, EXAMPLES_KEYS),
    productFamilyIds: pickStringList(source, FAMILY_KEYS),
  };
}

function adaptCategory(raw: unknown): ProductCategory | null {
  const source = asRecord(raw);
  if (!source || !isActive(source)) return null;

  const code = pickString(source, ["code", "id", "slug"]);
  const name = pickString(source, ["name", "label", "title"]);
  if (!code || !name) return null;

  const subcategories = pickArray(source, SUBCATEGORY_KEYS)
    .map(adaptSubcategory)
    .filter((entry): entry is ProductSubcategory => entry !== null);

  // A category with nothing under it is a production category, not one of
  // these — see the note at the top of the file.
  if (!subcategories.length) return null;

  return {
    code,
    name,
    bestFor: pickString(source, BEST_FOR_KEYS),
    subcategories,
  };
}

/** Payload keys the browsable tree could arrive under. */
const TREE_KEYS = ["productCategories", "customerCategories", "categories"];

/**
 * Normalise `GET /taxonomy` into the browsable tree.
 *
 * Returns the seed when the payload carries no tree — the current API still
 * serves only production categories, which have no subcategory level and would
 * be rejected by `adaptCategory`.
 */
export function adaptProductCategories(payload: unknown): ProductCategory[] {
  const source = asRecord(payload);
  if (!source) return PRODUCT_CATEGORY_SEED;

  for (const key of TREE_KEYS) {
    const adapted = asArray(source[key])
      .map(adaptCategory)
      .filter((entry): entry is ProductCategory => entry !== null);
    if (adapted.length) return adapted;
  }

  return PRODUCT_CATEGORY_SEED;
}

/** True when the tree came from the API rather than the bundled seed. */
export function isSeededTree(categories: ProductCategory[]): boolean {
  return categories === PRODUCT_CATEGORY_SEED;
}

/* -------------------------------------------------------------------------- */
/* Using the tree                                                              */
/* -------------------------------------------------------------------------- */

export function findCategory(
  categories: ProductCategory[],
  code: string | null | undefined,
): ProductCategory | null {
  if (!code) return null;
  return categories.find((category) => category.code === code) ?? null;
}

/** Catalog products that can print this subcategory, in catalog order. */
export function productsForSubcategory<T extends { family: string }>(
  subcategory: ProductSubcategory,
  catalog: T[],
): T[] {
  if (!subcategory.productFamilyIds.length) return [];
  const families = new Set(subcategory.productFamilyIds);
  return catalog.filter((product) => families.has(product.family));
}

/**
 * Split a category's subcategories by whether the app can price them today.
 *
 * The second group is not a failure state: GRIDGO prints those, Operations
 * quotes them off-app. Saying which is which is more use to a client than
 * hiding half the catalog or pretending every row leads somewhere.
 */
export function splitByAvailability<T extends { family: string }>(
  subcategories: ProductSubcategory[],
  catalog: T[],
): { orderable: ProductSubcategory[]; quotedByOperations: ProductSubcategory[] } {
  const orderable: ProductSubcategory[] = [];
  const quotedByOperations: ProductSubcategory[] = [];

  for (const subcategory of subcategories) {
    if (productsForSubcategory(subcategory, catalog).length) orderable.push(subcategory);
    else quotedByOperations.push(subcategory);
  }

  return { orderable, quotedByOperations };
}

export type SubcategoryHit = {
  category: ProductCategory;
  subcategory: ProductSubcategory;
};

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/**
 * Search the whole tree — the fast path for a client who already knows what
 * they want.
 *
 * Examples are searched as well as names, because "tote bag" and "x-stand" are
 * what a person types; neither is a subcategory name. Name matches rank above
 * example matches so an exact word does not sink below a category that merely
 * mentions it.
 */
export function searchSubcategories(
  categories: ProductCategory[],
  query: string,
): SubcategoryHit[] {
  const needle = normalize(query);
  if (needle.length < 2) return [];

  const byName: SubcategoryHit[] = [];
  const byExample: SubcategoryHit[] = [];

  for (const category of categories) {
    const categoryMatches = normalize(`${category.name} ${category.bestFor}`).includes(needle);
    for (const subcategory of category.subcategories) {
      const hit = { category, subcategory };
      if (normalize(subcategory.name).includes(needle)) byName.push(hit);
      else if (normalize(subcategory.examples).includes(needle) || categoryMatches) {
        byExample.push(hit);
      }
    }
  }

  return [...byName, ...byExample];
}
