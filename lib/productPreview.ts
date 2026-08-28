/**
 * Map catalog families to Product Preview templates.
 * Every render must carry: "Visual mockup — not print-ready proof."
 */

export const MOCKUP_LABEL = "Visual mockup — not print-ready proof.";

export type PreviewTemplate = "flyer" | "tarpaulin" | "signage" | "tshirt" | "generic";

export function templateForFamily(family: string | null | undefined): PreviewTemplate {
  switch (family) {
    case "flyer":
    case "card":
      return "flyer";
    case "banner":
      return "tarpaulin";
    case "sticker":
      return "signage";
    case "apparel":
      return "tshirt";
    default:
      return "generic";
  }
}

/**
 * Which template a shop's listing gets.
 *
 * A listing carries the platform's subcategory code rather than a catalog
 * family, so the mockup is chosen from that. Only the four templates GRIDGO
 * actually draws are mapped; anything else falls to `generic`, which names the
 * file instead of pretending to show it on a product that would be the wrong
 * shape.
 */
const SUBCATEGORY_TEMPLATES: Record<string, PreviewTemplate> = {
  flyers: "flyer",
  brochures: "flyer",
  business_cards: "flyer",
  invitations_greeting_cards: "flyer",
  menus_price_lists: "flyer",
  tarpaulins_outdoor_banners: "tarpaulin",
  posters_standees: "tarpaulin",
  business_store_signages: "signage",
  stickers_packaging_labels: "signage",
  custom_apparel: "tshirt",
};

export function templateForSubcategory(
  subcategoryCode: string | null | undefined,
): PreviewTemplate {
  if (!subcategoryCode) return "generic";
  return SUBCATEGORY_TEMPLATES[subcategoryCode] ?? "generic";
}

export function templateLabel(template: PreviewTemplate): string {
  switch (template) {
    case "flyer":
      return "Flyer";
    case "tarpaulin":
      return "Tarpaulin";
    case "signage":
      return "Signage";
    case "tshirt":
      return "T-shirt";
    default:
      return "Print product";
  }
}
