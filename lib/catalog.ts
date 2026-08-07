/**
 * Catalog helpers — category labels and reorder draft seeding.
 */

export type CatalogProduct = {
  id: string;
  name: string;
  family: string;
  basePriceMinor: number;
  unit: string;
};

/** Display order for product-first browsing. */
export const FAMILY_ORDER = ["flyer", "banner", "apparel", "sticker", "card"] as const;

export const FAMILY_LABELS: Record<string, string> = {
  flyer: "Flyers & brochures",
  banner: "Banners & tarpaulins",
  apparel: "Apparel",
  sticker: "Stickers & labels",
  card: "Business cards",
  signage: "Signage",
};

export function familyLabel(family: string): string {
  return FAMILY_LABELS[family] ?? family.replaceAll("_", " ");
}

export function groupCatalogByFamily(
  products: CatalogProduct[],
): { family: string; label: string; products: CatalogProduct[] }[] {
  const map = new Map<string, CatalogProduct[]>();
  for (const p of products) {
    const list = map.get(p.family) ?? [];
    list.push(p);
    map.set(p.family, list);
  }

  const ordered: { family: string; label: string; products: CatalogProduct[] }[] = [];
  const seen = new Set<string>();

  for (const family of FAMILY_ORDER) {
    const productsInFamily = map.get(family);
    if (productsInFamily?.length) {
      ordered.push({ family, label: familyLabel(family), products: productsInFamily });
      seen.add(family);
    }
  }

  for (const [family, productsInFamily] of map) {
    if (!seen.has(family)) {
      ordered.push({ family, label: familyLabel(family), products: productsInFamily });
    }
  }

  return ordered;
}

/** Unit label for price display. */
export function formatUnitPrice(basePriceMinor: number, unit: string): string {
  const php = `₱${(basePriceMinor / 100).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
  const unitLabel: Record<string, string> = {
    sqm: "per sqm",
    sheet: "per sheet",
    pack100: "per 100",
    box100: "per 100",
    piece: "each",
  };
  return `${php} ${unitLabel[unit] ?? unit}`;
}
