/**
 * Home's promo slot (gridgo-client#402): partner cards that share the
 * lower-right tile with Reorder. Operations writes them on the Promotions page;
 * the client reads only the live ones from `GET /me/promotions/home`.
 *
 * Everything a screen decides about a promo is here, so the tile, the sheet
 * and the tracking stay one set of rules.
 */

export type PromotionTag = "partner" | "sponsored" | "featured_shop";
export type PromotionTapAction = "sheet" | "link";
export type PromotionStyle = "light" | "yellow";
export type PromotionEventType = "view" | "open" | "tap";

export type HomePromotion = {
  id: string;
  name: string;
  /** Ready to render, or null when the feed sent none. */
  logoUrl: string | null;
  imageUrl: string | null;
  description: string;
  tag: PromotionTag;
  /** Operations' words for the link; empty when none was written. */
  linkText: string;
  /** Always https: anything else is dropped from the feed. */
  linkUrl: string;
  tapAction: PromotionTapAction;
  style: PromotionStyle;
};

/** One page of the rotating tile: Reorder always, then each live promo. */
export type HomeSlide = { kind: "reorder" } | { kind: "promo"; promo: HomePromotion };

/** How long each page stays before the tile turns to the next. */
export const PROMO_ROTATE_MS = 5000;

const TAG_LABELS: Record<PromotionTag, string> = {
  partner: "Partner",
  sponsored: "Sponsored",
  featured_shop: "Featured shop",
};

export function promotionTagLabel(tag: PromotionTag): string {
  return TAG_LABELS[tag];
}

/** Reorder leads and never leaves; with no promos it is the whole tile. */
export function homeSlides(promos: readonly HomePromotion[]): HomeSlide[] {
  return [{ kind: "reorder" }, ...promos.map((promo) => ({ kind: "promo" as const, promo }))];
}

/** The page after `index`, wrapping back to Reorder. */
export function nextSlideIndex(index: number, count: number): number {
  if (count <= 1) return 0;
  return (index + 1) % count;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isHttps(value: string): boolean {
  return /^https:\/\/[^\s/]+/i.test(value);
}

/**
 * A file ref from the feed: a plain URL, or the attachments flow's
 * `{downloadUrl}` / `{url}` object. A `logoUrl` sibling is read too.
 */
function fileUrl(item: Record<string, unknown>, key: "logo" | "image"): string | null {
  const flat = text(item[`${key}Url`]);
  if (flat) return flat;
  const raw = item[key];
  if (typeof raw === "string") return raw.trim() || null;
  const ref = record(raw);
  if (!ref) return null;
  return text(ref.downloadUrl) || text(ref.url) || null;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

/**
 * The feed, read forgivingly: a malformed promo is dropped rather than drawn,
 * and an unknown tag, tap action or style falls back to the safe default.
 * The server already sends only live promos in display order; that order is
 * kept as sent.
 */
export function promotionsFrom(body: unknown): HomePromotion[] {
  const root = record(body);
  const list = Array.isArray(body) ? body : Array.isArray(root?.promotions) ? root.promotions : [];
  const out: HomePromotion[] = [];
  const seen = new Set<string>();
  for (const entry of list) {
    const item = record(entry);
    if (!item) continue;
    const id = text(item.id);
    const name = text(item.name);
    const linkUrl = text(item.linkUrl);
    if (!id || !name || !isHttps(linkUrl) || seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      name,
      logoUrl: fileUrl(item, "logo"),
      imageUrl: fileUrl(item, "image"),
      description: text(item.description),
      tag: oneOf(item.tag, ["partner", "sponsored", "featured_shop"] as const, "partner"),
      linkText: text(item.linkText),
      linkUrl,
      tapAction: oneOf(item.tapAction, ["sheet", "link"] as const, "sheet"),
      style: oneOf(item.style, ["light", "yellow"] as const, "light"),
    });
  }
  return out;
}

function randomId(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return uuid;
  const part = () => Math.random().toString(36).slice(2, 10);
  return `${Date.now().toString(36)}-${part()}-${part()}`;
}

/** Made once per app launch: a view counts once per session per promo. */
let sessionId: string | null = null;
const viewed = new Set<string>();

export function promotionSessionId(): string {
  if (!sessionId) sessionId = randomId();
  return sessionId;
}

/**
 * True the first time a promo is shown this session, false after. The server
 * de-duplicates by session too; this keeps the phone from asking it to.
 */
export function claimPromotionView(promoId: string): boolean {
  if (viewed.has(promoId)) return false;
  viewed.add(promoId);
  return true;
}

/** Tests only: a fresh app launch. */
export function resetPromotionSession(): void {
  sessionId = null;
  viewed.clear();
}

/** The sheet's button: Operations' link text, else "Visit <name>". */
export function promoLinkLabel(promo: Pick<HomePromotion, "linkText" | "name">): string {
  return promo.linkText || `Visit ${promo.name}`;
}
