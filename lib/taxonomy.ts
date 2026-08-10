/**
 * Product taxonomy the platform already defines.
 *
 * Materials and finishes come from `GET /taxonomy`, never from free text: two
 * clients ordering the same 13oz tarpaulin must produce the same stored value.
 * The catalog product's `family` selects which categories apply, and those
 * categories select which materials and finishes a client may choose.
 */

export type TaxonomyCategory = {
  id: string;
  code: string;
  name: string;
  productFamilyIds: string[];
  active: boolean;
};

export type TaxonomyItem = {
  id: string;
  code: string;
  name: string;
  categoryCodes: string[];
  active: boolean;
};

export type Taxonomy = {
  categories: TaxonomyCategory[];
  materials: TaxonomyItem[];
  finishes: TaxonomyItem[];
};

export const EMPTY_TAXONOMY: Taxonomy = {
  categories: [],
  materials: [],
  finishes: [],
};

/** One row in a picker: what it is, and what it is good for. */
export type TaxonomyOption = {
  /** Stored on the order — the stable platform value, not a typed string. */
  value: string;
  label: string;
  /** Secondary line: the categories this option serves, in plain words. */
  hint: string | null;
};

/** Categories that cover a catalog family (e.g. `banner` → large format, signage). */
export function categoriesForFamily(
  taxonomy: Taxonomy,
  family: string | null | undefined,
): TaxonomyCategory[] {
  if (!family) return taxonomy.categories.filter((c) => c.active);
  const matched = taxonomy.categories.filter(
    (c) => c.active && c.productFamilyIds.includes(family),
  );
  // A family the taxonomy has not been told about must not silently offer
  // nothing — fall back to every active category rather than an empty picker.
  return matched.length ? matched : taxonomy.categories.filter((c) => c.active);
}

function optionsFor(
  items: TaxonomyItem[],
  categories: TaxonomyCategory[],
): TaxonomyOption[] {
  const allowed = new Set(categories.map((c) => c.code));
  const nameByCode = new Map(categories.map((c) => [c.code, c.name]));

  return items
    .filter((item) => item.active && item.categoryCodes.some((code) => allowed.has(code)))
    .map((item) => {
      const served = item.categoryCodes
        .filter((code) => allowed.has(code))
        .map((code) => nameByCode.get(code))
        .filter((name): name is string => Boolean(name));
      return {
        value: item.name,
        label: item.name,
        hint: served.length ? served.join(" · ") : null,
      };
    });
}

/**
 * Materials a client may pick for this product family.
 *
 * The stored value is the material's display name, because that is what the
 * order record and every other GRIDGO app already read from `order.material`.
 */
export function materialOptions(
  taxonomy: Taxonomy,
  family: string | null | undefined,
): TaxonomyOption[] {
  return optionsFor(taxonomy.materials, categoriesForFamily(taxonomy, family));
}

/** Finishes a client may pick for this product family. */
export function finishOptions(
  taxonomy: Taxonomy,
  family: string | null | undefined,
): TaxonomyOption[] {
  return optionsFor(taxonomy.finishes, categoriesForFamily(taxonomy, family));
}

/**
 * A stored material or finish, in words.
 *
 * The app writes display names onto an order, but an order can also arrive
 * carrying a taxonomy *code* — seeded records and orders placed by Operations
 * both do. `hem_grommet` reached a client's specification card that way. This
 * resolves a code back to its name and leaves an already-readable value alone;
 * an unrecognised code is de-slugged rather than shown raw.
 */
export function taxonomyLabel(
  taxonomy: Taxonomy,
  stored: string | null | undefined,
): string {
  const value = stored?.trim();
  if (!value) return "—";

  const match = [...taxonomy.materials, ...taxonomy.finishes].find(
    (item) => item.code === value || item.name === value,
  );
  if (match) return match.name;

  // No taxonomy loaded, or a code it no longer carries. Never a bare slug.
  if (/^[a-z0-9]+(_[a-z0-9]+)+$/.test(value)) {
    return value
      .split("_")
      .map((word, index) => (index === 0 ? word.charAt(0).toUpperCase() + word.slice(1) : word))
      .join(" ");
  }
  return value;
}

/**
 * True when a stored value is still one the platform offers.
 *
 * A draft kept across an app kill can outlive a taxonomy edit; the picker
 * shows the stale value as no longer offered rather than pretending it matches.
 */
export function isKnownOption(options: TaxonomyOption[], value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  return options.some((option) => option.value === trimmed);
}
