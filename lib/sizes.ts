/**
 * Size presets per catalog family.
 *
 * Unlike materials and finishes, the platform has no size taxonomy, so this
 * list is the client's own. It exists for the same reason: a picker keeps two
 * clients ordering the same 3x6 ft tarpaulin on one string. Custom stays
 * available where a trade genuinely cuts to order, and is marked as such so a
 * client knows Operations has to confirm it.
 */

export type SizeOption = {
  value: string;
  label: string;
  /** Secondary line — the same size in the other unit, or what it is used for. */
  hint: string | null;
};

export type SizeCatalogEntry = {
  options: SizeOption[];
  /** False where the trade only prints fixed sizes (business cards). */
  allowCustom: boolean;
  /** Shown under a custom entry so the constraint arrives before the error. */
  customHint: string;
};

const CUT_TO_ORDER = "Operations confirms feasibility before this job is matched.";

const SIZE_CATALOG: Record<string, SizeCatalogEntry> = {
  banner: {
    allowCustom: true,
    customHint: `Tarpaulin is cut to order. ${CUT_TO_ORDER}`,
    options: [
      { value: "2x3 ft", label: "2 × 3 ft", hint: "Counter and door signs" },
      { value: "3x4 ft", label: "3 × 4 ft", hint: "Stall and booth banners" },
      { value: "3x6 ft", label: "3 × 6 ft", hint: "Most common storefront size" },
      { value: "4x8 ft", label: "4 × 8 ft", hint: "Facade and stage banners" },
      { value: "5x10 ft", label: "5 × 10 ft", hint: "Roadside and event spans" },
    ],
  },
  flyer: {
    allowCustom: true,
    customHint: `Non-standard trims are cut to order. ${CUT_TO_ORDER}`,
    options: [
      { value: "A6", label: "A6", hint: "105 × 148 mm — handbills" },
      { value: "A5", label: "A5", hint: "148 × 210 mm — most flyers" },
      { value: "A4", label: "A4", hint: "210 × 297 mm — menus, brochures" },
      { value: "DL", label: "DL", hint: "99 × 210 mm — rack and envelope inserts" },
    ],
  },
  card: {
    allowCustom: false,
    customHint: "",
    options: [
      { value: "3.5x2 in", label: "3.5 × 2 in", hint: "Standard Philippine card" },
      { value: "90x50 mm", label: "90 × 50 mm", hint: "European card" },
      { value: "85x55 mm", label: "85 × 55 mm", hint: "Slim card" },
    ],
  },
  sticker: {
    allowCustom: true,
    customHint: `Die-cut shapes are made to order. ${CUT_TO_ORDER}`,
    options: [
      { value: "2x2 in", label: "2 × 2 in", hint: "Seals and labels" },
      { value: "3x3 in", label: "3 × 3 in", hint: "Product and bottle labels" },
      { value: "A6 sheet", label: "A6 sheet", hint: "105 × 148 mm, multiple per sheet" },
      { value: "A4 sheet", label: "A4 sheet", hint: "210 × 297 mm, multiple per sheet" },
    ],
  },
  apparel: {
    allowCustom: false,
    customHint: "",
    options: [
      { value: "S", label: "Small", hint: null },
      { value: "M", label: "Medium", hint: null },
      { value: "L", label: "Large", hint: null },
      { value: "XL", label: "Extra large", hint: null },
      { value: "2XL", label: "2XL", hint: null },
    ],
  },
};

const FALLBACK: SizeCatalogEntry = {
  allowCustom: true,
  customHint: `This product has no preset sizes yet. ${CUT_TO_ORDER}`,
  options: [],
};

export function sizeCatalogFor(family: string | null | undefined): SizeCatalogEntry {
  if (!family) return FALLBACK;
  return SIZE_CATALOG[family] ?? FALLBACK;
}

/** True when `value` is one of the presets for this family. */
export function isPresetSize(family: string | null | undefined, value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  return sizeCatalogFor(family).options.some((option) => option.value === trimmed);
}

/**
 * How a chosen size should read back on the review screen: the preset's own
 * label, or the client's words marked as custom.
 */
export function describeSize(family: string | null | undefined, value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "—";
  const preset = sizeCatalogFor(family).options.find((o) => o.value === trimmed);
  if (preset) return preset.label;
  return `${trimmed} (custom)`;
}
