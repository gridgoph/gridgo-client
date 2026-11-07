/**
 * Reordering a past job through the current order flow.
 *
 * A reorder is a new job with the product already known: the date, delivery,
 * ranking, match and checkout all run as they do for any new print, so the
 * price and the shop are today's. Only what still means the same thing is
 * carried over: the product, how it reached the client, how many, the options
 * and size where the listing picked still offers them, and the artwork while
 * GRIDGO keeps it. Never the deadline, shop, price or a voucher.
 *
 * Pure. `hooks/useReorder.ts` runs it and `store/reorderJob.ts` holds the job.
 */

import { PRODUCT_CATEGORY_SEED } from "@/data/productCategories";
import type {
  CatalogItem,
  CatalogProduct,
  LineMeasurement,
  Order,
  ProductionItem,
  RequestFulfilment,
} from "@/lib/api";
import { attachmentFileIds, lineAttachments } from "@/lib/artworkAttachments";
import type { ListingSelection } from "@/lib/listing";
import { toDraft, type MeasurementDraft } from "@/lib/measurement";
import type { ProductCategory } from "@/lib/productCategories";
import { deliveryChoice, PICKUP_CHOICE } from "@/lib/requestFulfilment";

export type ReorderTarget = { category: string; subcategory: string };

/** What the listing sheet starts from. `groupName` is null on an old-shape order. */
export type ReorderAnswers = {
  quantity: number;
  pricingUnit: string | null;
  packageQty: number | null;
  options: { groupName: string | null; label: string }[];
  measurement: LineMeasurement | null;
  /** The unit that measurement was given in; null when it has none (pages). */
  measureUnit: string | null;
};

/** A reorder is one job, so an order with several items repeats its first. */
function firstItem(order: Pick<Order, "productionItems">): ProductionItem | null {
  return order.productionItems?.[0] ?? null;
}

const same = (left: string | null | undefined, right: string | null | undefined): boolean =>
  (left ?? "").trim().toLowerCase() === (right ?? "").trim().toLowerCase();

function targetFor(tree: readonly ProductCategory[], code: string): ReorderTarget | null {
  const category = tree.find((entry) => entry.subcategories.some((sub) => sub.code === code));
  return category ? { category: category.code, subcategory: code } : null;
}

/** GRIDGO's tree does not publish families yet, so the seed's map answers for it. */
function familiesOf(sub: ProductCategory["subcategories"][number]): readonly string[] {
  if (sub.productFamilyIds.length) return sub.productFamilyIds;
  return (
    PRODUCT_CATEGORY_SEED.flatMap((category) => category.subcategories).find((seeded) => seeded.code === sub.code)
      ?.productFamilyIds ?? []
  );
}

function wordsOf(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 2)
    .map((word) => word.replace(/s$/, ""));
}

/** An old-shape order names a catalog product, not a subcategory. Its words break a tie. */
function targetByFamily(
  order: Pick<Order, "productId" | "title">,
  tree: readonly ProductCategory[],
  catalog: readonly CatalogProduct[],
): ReorderTarget | null {
  const product = catalog.find((entry) => entry.id === order.productId);
  if (!product) return null;
  const printing = tree.flatMap((category) =>
    category.subcategories
      .filter((sub) => familiesOf(sub).includes(product.family))
      .map((sub) => ({ category: category.code, subcategory: sub.code, name: sub.name })),
  );
  // "Store opening tarpaulin" under the banner family is not "Posters & standees".
  const title = wordsOf(order.title);
  const productName = wordsOf(product.name);
  const score = (name: string) => {
    const words = wordsOf(name);
    return 2 * words.filter((word) => title.includes(word)).length + words.filter((word) => productName.includes(word)).length;
  };
  const pick = printing.reduce<(typeof printing)[number] | null>(
    (best, sub) => (!best || score(sub.name) > score(best.name) ? sub : best),
    null,
  );
  return pick ? { category: pick.category, subcategory: pick.subcategory } : null;
}

/**
 * Which product the job is, or null when nothing says. GRIDGO's own
 * `subcategoryCode` decides; an order without one falls back to its product's
 * family, and with neither the client chooses on the category screen.
 */
export function reorderTarget(
  order: Pick<Order, "productId" | "title" | "productionItems">,
  tree: readonly ProductCategory[],
  catalog: readonly CatalogProduct[],
): ReorderTarget | null {
  const code = firstItem(order)?.subcategoryCode;
  return (code ? targetFor(tree, code) : null) ?? targetByFamily(order, tree, catalog);
}

/** How the last one reached the client. Checks a drop-off is a real point first. */
export function reorderFulfilment(order: Pick<Order, "fulfillmentMode" | "dropoff">): RequestFulfilment | null {
  if (order.fulfillmentMode === "pickup") return PICKUP_CHOICE;
  const point = order.dropoff;
  return point && Number.isFinite(point.lat) && Number.isFinite(point.lng) ? deliveryChoice(point) : null;
}

function measurementOf(item: ProductionItem | null): LineMeasurement | null {
  const measured = item?.measurement;
  if (!measured) return null;
  const { widthMilli: width, heightMilli: height, lengthMilli: length, pages } = measured;
  return width == null && height == null && length == null && pages == null ? null : { width, height, length, pages };
}

export function reorderAnswers(
  order: Pick<Order, "quantity" | "size" | "material" | "finish" | "productionItems">,
): ReorderAnswers {
  const item = firstItem(order);
  const labels = [order.size, order.material, order.finish].filter((label): label is string => Boolean(label?.trim()));
  return {
    quantity: item?.quantity ?? order.quantity,
    pricingUnit: item?.pricingUnit ?? null,
    packageQty: item?.packageQty ?? null,
    options: item?.options.length
      ? item.options.map(({ groupName, label }) => ({ groupName, label }))
      : labels.map((label) => ({ groupName: null, label })),
    measurement: measurementOf(item),
    measureUnit: item?.measurement?.unit ?? null,
  };
}

/** The files to bring along; whether GRIDGO still keeps each is read separately. */
export function reorderArtworkFileIds(order: Pick<Order, "artworkFileIds" | "productionItems">): string[] {
  const item = firstItem(order);
  if (item) return attachmentFileIds(lineAttachments(item));
  // An old-shape order holds its corrections in a row, and the last is the job.
  const latest = order.artworkFileIds?.at(-1);
  return latest ? [latest] : [];
}

export type ReorderSheet = {
  selection: ListingSelection;
  /** Null when "how many" means something else on this listing. */
  quantity: number | null;
  measured: MeasurementDraft | null;
};

/**
 * The sheet's starting answers. An option the listing no longer offers stays
 * unanswered, so the sheet asks for it the usual way rather than guessing.
 * "How many" only carries where one of them is the same thing: 2 packs of 100
 * is not 2 pieces. An old-shape order has no unit to compare and keeps its count.
 */
export function reorderSheet(
  answers: ReorderAnswers,
  item: Pick<CatalogItem, "optionGroups" | "pricingUnit" | "packageQty" | "measureUnit">,
): ReorderSheet {
  const selection: ListingSelection = {};
  for (const group of item.optionGroups) {
    const answer = answers.options.find(
      (option) =>
        (option.groupName == null || same(option.groupName, group.name)) &&
        group.options.some((candidate) => same(candidate.label, option.label)),
    );
    const chosen = answer && group.options.find((candidate) => same(candidate.label, answer.label));
    if (chosen) selection[group.id] = chosen.id;
  }
  const sameUnit =
    answers.pricingUnit == null ||
    (answers.pricingUnit === item.pricingUnit && (answers.packageQty ?? null) === (item.packageQty ?? null));
  const sameMeasure = sameUnit && (answers.measureUnit == null || answers.measureUnit === item.measureUnit);
  return {
    selection,
    quantity: sameUnit ? answers.quantity : null,
    measured: sameMeasure && answers.measurement ? toDraft(answers.measurement) : null,
  };
}

/** Whether a sheet starts from this job: its own product, before it has a line. */
export function reorderApplies(
  job: { subcategory: string; lineId: string | null } | null,
  item: Pick<CatalogItem, "subcategoryCode">,
): boolean {
  return job != null && job.lineId == null && (!item.subcategoryCode || item.subcategoryCode === job.subcategory);
}

/** Said above the sheet's options, so a carried answer is checked, not assumed. */
export const REORDER_SHEET_NOTE = "Filled in from your past order. Check each choice before adding.";

/** Said on the Artwork step, because nobody uploaded what is on the list. */
export function reorderArtworkNote(productName: string, carried: readonly string[], refused: readonly string[]): string | null {
  const parts: string[] = [];
  if (carried.length) parts.push(`${carried.join(", ")} came from your past order. Remove it to use a different file.`);
  if (refused.length) parts.push(`${productName} does not take ${refused.join(", ")} from your past order. Upload a file here instead.`);
  return parts.length ? parts.join(" ") : null;
}
