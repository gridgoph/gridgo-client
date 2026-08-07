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
