/**
 * The captain's product category chart, transcribed.
 *
 * Five categories, twenty-two subcategories. Each category carries the audience
 * line a client uses to recognise themselves ("best for student orgs, HR teams,
 * event organizers"); each subcategory carries its examples.
 *
 * This is a **fallback**, not the source of truth. `GET /taxonomy` owns this
 * tree — see `lib/productCategories.ts`, which prefers the API payload and only
 * falls back here when the API has not published the tree yet. Delete this file
 * once every deployment serves the tree.
 *
 * `productFamilyIds` maps a subcategory onto the catalog families GRIDGO
 * actually prices today. It is deliberately conservative: a subcategory is
 * mapped only where a catalog product genuinely prints that thing. Acrylic
 * build-up letters are not a tarpaulin, so "Business & Store Signages" carries
 * no family and the app says so, rather than quietly ordering the wrong job.
 */

import type { ProductCategory } from "@/lib/productCategories";

export const PRODUCT_CATEGORY_SEED: ProductCategory[] = [
  {
    code: "marketing_collateral",
    name: "Marketing & promotional collateral",
    bestFor:
      "Businesses, startups, and events looking to promote services or distribute physical marketing material.",
    subcategories: [
      {
        code: "flyers",
        name: "Flyers",
        examples: "Single sheets, event promos, product announcements",
        productFamilyIds: ["flyer"],
      },
      {
        code: "brochures",
        name: "Brochures",
        examples: "Bi-fold, tri-fold, company profiles",
        productFamilyIds: ["flyer"],
      },
      {
        code: "posters_standees",
        name: "Posters & standees",
        examples: "Indoor event posters, pull-up banners, x-stands",
        productFamilyIds: ["banner"],
      },
      {
        code: "business_cards",
        name: "Business cards",
        examples: "Standard, matte, glossy, textured, QR-code enabled",
        productFamilyIds: ["card"],
      },
      {
        code: "stickers_packaging_labels",
        name: "Stickers & packaging labels",
        examples: "Die-cut product labels, vinyl stickers, sheet stickers",
        productFamilyIds: ["sticker"],
      },
      {
        code: "tarpaulins_outdoor_banners",
        name: "Tarpaulins & outdoor banners",
        examples: "Event banners, billboards, temporary roadside signs",
        productFamilyIds: ["banner"],
      },
    ],
  },
  {
    code: "corporate_event_merch",
    name: "Corporate & event merchandise",
    bestFor: "Student orgs, HR teams, event organizers, and corporate branding.",
    subcategories: [
      {
        code: "lanyards_id_accessories",
        name: "Lanyards & ID accessories",
        examples: "Sublimation lanyards, custom ID laces, badge holders",
        productFamilyIds: [],
      },
      {
        code: "custom_apparel",
        name: "Custom apparel",
        examples: "T-shirts, hoodies, polo shirts, tote bags",
        productFamilyIds: ["apparel"],
      },
      {
        code: "drinkware",
        name: "Drinkware",
        examples: "Sublimation mugs, laser-engraved tumblers, water bottles",
        productFamilyIds: [],
      },
      {
        code: "corporate_giveaways",
        name: "Corporate giveaways",
        examples: "Eco-bags, umbrellas, customized pens, keychains, notebooks",
        productFamilyIds: [],
      },
    ],
  },
  {
    code: "recognition_awards_signage",
    name: "Recognition, awards & signage",
    bestFor:
      "Competitions, graduations, guest speakers, store branding, and office spaces.",
    subcategories: [
      {
        code: "certificates_diplomas",
        name: "Certificates & diplomas",
        examples: "Specialty paper, foil-stamped, embossed",
        productFamilyIds: [],
      },
      {
        code: "plaques_trophies",
        name: "Plaques & trophies",
        examples: "Custom acrylic cut, wooden plaques, 3D-printed awards",
        productFamilyIds: [],
      },
      {
        code: "medals_ribbons",
        name: "Medals & ribbons",
        examples: "Metal and acrylic medals with custom sublimation ribbons",
        productFamilyIds: [],
      },
      {
        code: "business_store_signages",
        name: "Business & store signages",
        examples: "Acrylic build-up letters, Panaflex lightboxes, LED neon flex",
        productFamilyIds: [],
      },
    ],
  },
  {
    code: "specialized_prototyping",
    name: "Specialized & prototyping services",
    bestFor:
      "Architecture students, engineers, industrial designers, and specialized builds.",
    subcategories: [
      {
        code: "three_d_printing_scale_models",
        name: "3D printing & scale models",
        examples: "Rapid prototyping, architectural scale models, custom parts",
        productFamilyIds: [],
      },
      {
        code: "blueprint_cad_plotting",
        name: "Blueprint & CAD plotting",
        examples: "Large-format architectural and engineering plans",
        productFamilyIds: [],
      },
      {
        code: "packaging_box_production",
        name: "Packaging & box production",
        examples: "Custom product boxes, mailer boxes, food-grade packaging",
        productFamilyIds: [],
      },
    ],
  },
  {
    // The everyday paperwork the first four had nowhere to put: a thesis, a
    // hundred handouts, a set of ID photographs. None of it is marketing,
    // merchandise, an award or a prototype.
    code: "document_publication",
    name: "Documents & publications",
    bestFor:
      "Students, teachers, offices, and anyone with paperwork to print, bind, or copy.",
    subcategories: [
      {
        code: "document_printing",
        name: "Document printing",
        examples: "Black and white or colour, short, A4 and long, back-to-back",
        productFamilyIds: [],
      },
      {
        code: "booklets",
        name: "Booklets",
        examples: "Bifold and trifold, programmes, handouts",
        productFamilyIds: [],
      },
      {
        code: "risograph",
        name: "Risograph printing",
        examples: "High-volume handouts, exam papers, reviewers by the ream",
        productFamilyIds: [],
      },
      {
        code: "binding_hardbound",
        name: "Binding & hardbound",
        examples: "Thesis hardbound, ring and softcover binding, gold or silver spine",
        productFamilyIds: [],
      },
      {
        code: "id_photos",
        name: "ID photos",
        examples: "1x1, 2x2 and passport, wallet and family size, photo paper or PVC",
        productFamilyIds: [],
      },
    ],
  },
];
