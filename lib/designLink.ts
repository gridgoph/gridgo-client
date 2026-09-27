import type { AcceptedFormat, ArtworkLink, ArtworkLinkCheck, CartLineRecord } from "@/lib/api";

/**
 * A design link: the artwork kept on Canva (or Drive, Dropbox, Figma) rather
 * than uploaded as a file.
 *
 * `docs/ORDER_MATCH_API.md#artwork-design-links` in gridgo-api is the
 * contract. Two rules shape everything here:
 *
 * - GRIDGO stores only an HTTPS link, and a `canva_link` only on canva.com, so
 *   the field refuses anything else before a round trip rather than after.
 * - `POST /artwork/link-check` is advice, never a grant. It can prove a link is
 *   public (or plainly is not), and most of the time it honestly cannot tell —
 *   a Canva design is an HTML shell to anyone without a browser. That answer
 *   is a warning the client may continue past, never a tick.
 */

export type LinkProvider = ArtworkLinkCheck["provider"];

const PROVIDER_NAMES: Record<LinkProvider, string> = {
  canva: "Canva",
  google_drive: "Google Drive",
  dropbox: "Dropbox",
  figma: "Figma",
  other: "Web link",
};

export function providerName(provider: LinkProvider): string {
  return PROVIDER_NAMES[provider];
}

function onDomain(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/\.$/, "");
  } catch {
    return "";
  }
}

/**
 * Canva's own short links. "Copy link" in Canva's Share menu can hand out a
 * `canva.link` address, which gridgo-api does not file as a `canva_link` (it
 * takes canva.com only), so it can go only where the shop takes other links.
 */
function isCanvaShortLink(url: string): boolean {
  return onDomain(hostOf(url), "canva.link");
}

/** The same domain boundary gridgo-api uses, plus Canva's short links. */
export function providerOf(url: string): LinkProvider {
  const host = hostOf(url);
  if (onDomain(host, "canva.com") || onDomain(host, "canva.link")) return "canva";
  if (host === "drive.google.com" || host === "docs.google.com") return "google_drive";
  if (onDomain(host, "dropbox.com") || onDomain(host, "dropboxusercontent.com")) return "dropbox";
  if (onDomain(host, "figma.com")) return "figma";
  return "other";
}

/**
 * The two link formats GRIDGO keeps on an order.
 *
 * The registry has more url-kind formats (`google_drive`, `dropbox`,
 * `we_transfer`), but the cart refuses any link not filed under one of these
 * two, so only these open the field. A Drive link goes as an `other_link`.
 */
const STORABLE_LINK_CODES = ["canva_link", "other_link"];

/** The link formats this listing takes that GRIDGO can store, active only. */
export function designLinkFormats(formats: AcceptedFormat[]): AcceptedFormat[] {
  return formats.filter(
    (format) =>
      format.active !== false &&
      format.inputKind === "url" &&
      STORABLE_LINK_CODES.includes(format.code),
  );
}

function linkCodes(formats: AcceptedFormat[]): Set<string> {
  return new Set(designLinkFormats(formats).map((format) => format.code));
}

/**
 * How a screen names what the field takes, in a client's words.
 *
 * The platform's display names are "Canva link" and "Other link"; "paste a
 * link from Canva link" is what the listing sheet used to say.
 */
export function designLinkPhrase(formats: AcceptedFormat[]): string {
  const codes = linkCodes(formats);
  const canva = codes.has("canva_link");
  const other = codes.has("other_link");
  if (canva && other) return "a Canva, Google Drive or Dropbox link";
  if (canva) return "a Canva link";
  if (other) return "a Google Drive, Dropbox or other sharing link";
  return "";
}

export type ParsedDesignLink =
  | { ok: true; link: ArtworkLink; provider: LinkProvider }
  | { ok: false; message: string };

const MAX_URL = 2000;

/**
 * Read what the client pasted into one link this listing takes.
 *
 * A bare `www.canva.com/...` is taken as HTTPS — people copy from the address
 * bar. The format is decided from the address: a canva.com link is a Canva
 * link where the shop takes one, and anything else goes as an other link.
 */
export function parseDesignLink(text: string, formats: AcceptedFormat[]): ParsedDesignLink {
  const trimmed = text.trim();
  if (!trimmed) return { ok: false, message: "Paste the link to your design." };
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
  if (withScheme.length > MAX_URL || /\s/.test(withScheme)) {
    return { ok: false, message: "That is not one whole link. Copy it again from the Share menu." };
  }
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return { ok: false, message: "That is not a web link. Copy it again from the Share menu." };
  }
  if (url.protocol === "http:") {
    return { ok: false, message: "Use the link that starts with https://." };
  }
  if (url.protocol !== "https:" || !url.hostname.includes(".") || url.username || url.password) {
    return { ok: false, message: "That is not a web link. Copy it again from the Share menu." };
  }

  const provider = providerOf(withScheme);
  const codes = linkCodes(formats);
  const shortCanva = isCanvaShortLink(withScheme);
  const formatCode =
    provider === "canva" && !shortCanva && codes.has("canva_link")
      ? "canva_link"
      : codes.has("other_link")
        ? "other_link"
        : null;
  if (!formatCode && shortCanva) {
    return {
      ok: false,
      message:
        "That is a Canva short link. Open your design in Canva and copy the canva.com address instead.",
    };
  }
  if (!formatCode) {
    return {
      ok: false,
      message: codes.has("canva_link")
        ? "This shop takes Canva links only. Paste a canva.com link, or upload the file."
        : "This shop does not take design links. Upload the file instead.",
    };
  }
  return { ok: true, link: { formatCode, url: withScheme }, provider };
}

/** What GRIDGO holds for this line. An older API sends no field at all. */
export function lineArtworkLinks(line: Pick<CartLineRecord, "artworkLinks"> | null | undefined): ArtworkLink[] {
  return Array.isArray(line?.artworkLinks) ? line.artworkLinks : [];
}

/** A file or a link: either is artwork GRIDGO can take to Operations. */
export function lineHasArtwork(line: Pick<CartLineRecord, "artworkFileId" | "artworkLinks">): boolean {
  return Boolean(line.artworkFileId) || lineArtworkLinks(line).length > 0;
}

export function sameLinks(a: ArtworkLink[], b: ArtworkLink[]): boolean {
  return (
    a.length === b.length &&
    a.every((link, index) => link.url === b[index].url && link.formatCode === b[index].formatCode)
  );
}

/** Where one link check stands. `unavailable` is an API without the route. */
export type LinkCheckState =
  | { phase: "checking" }
  | { phase: "checked"; check: ArtworkLinkCheck }
  | { phase: "unavailable" }
  | { phase: "failed"; message: string; blocks: boolean };

export type LinkVerdict = {
  tone: "success" | "warning" | "error";
  title: string;
  body: string | null;
  /** True only when the link plainly will not work: it is not kept on the line. */
  blocks: boolean;
};

const SHARING_FIX = "In the Share menu, set access to Anyone with the link, then paste it again.";
const CONTINUE_NOTE = "You can still continue. Operations opens every design before it is printed.";

/**
 * What a check result says to the client.
 *
 * Decided from `access` and `reachable`, never from `message` — the API says
 * its wording may change. Its message is shown only when the link could not be
 * reached, where it is the one thing that says why (a timeout, a bad redirect).
 */
export function linkVerdict(state: LinkCheckState | null | undefined): LinkVerdict | null {
  if (!state || state.phase === "checking" || state.phase === "unavailable") return null;
  if (state.phase === "failed") {
    return { tone: state.blocks ? "error" : "warning", title: state.message, body: null, blocks: state.blocks };
  }
  const { check } = state;
  switch (check.access) {
    case "public_edit":
      return { tone: "success", title: "Anyone with the link can edit it", body: null, blocks: false };
    case "public_view":
      return { tone: "success", title: "Anyone with the link can view it", body: null, blocks: false };
    case "sign_in_required":
      return {
        tone: "error",
        title: "This link asks people to sign in",
        body: SHARING_FIX,
        blocks: true,
      };
    case "not_found":
      return {
        tone: "error",
        title: "We couldn't open this link",
        body: "Nothing is at that address. Check you copied the whole link, and that the design was not deleted.",
        blocks: true,
      };
    default:
      return check.reachable
        ? {
            tone: "warning",
            title: "We couldn't confirm who can open it",
            // The page answered, so there is no reason worth relaying — only
            // the one setting that makes it work.
            body: `Make sure sharing is set to Anyone with the link. ${CONTINUE_NOTE}`,
            blocks: false,
          }
        : {
            tone: "warning",
            title: "We couldn't open this link",
            body: `${check.message} ${CONTINUE_NOTE}`.trim(),
            blocks: false,
          };
  }
}

/** The steps are Canva's own labels, so a client can find each one on screen. */
export const CANVA_SHARE_STEPS = [
  "Open your design in Canva and tap Share.",
  "Under Collaboration link, change Only you can access to Anyone with the link.",
  "Tap Copy link, then paste it here.",
] as const;

export const OTHER_SHARE_STEPS = [
  "Open the file's Share or Get link option.",
  "Set access to Anyone with the link.",
  "Copy the link, then paste it here.",
] as const;

/** "Canva link", "Google Drive link" — what a saved link is, by where it points. */
export function linkLabel(link: ArtworkLink): string {
  const provider = providerOf(link.url);
  return provider === "other" ? "Design link" : `${providerName(provider)} link`;
}

/** The address without its scheme or `www.`, for a line too narrow for all of it. */
export function linkDisplay(url: string): string {
  return url.replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/$/, "");
}

/** What a basket line carries, in the words of the checkout row. */
export function lineArtworkSummary(line: Pick<CartLineRecord, "artworkFileId" | "artworkLinks">): string {
  const links = lineArtworkLinks(line);
  if (line.artworkFileId && links.length) return `Artwork and ${linkLabel(links[0])} attached`;
  if (line.artworkFileId) return "Artwork attached";
  if (links.length) return `${linkLabel(links[0])} attached`;
  return "No artwork yet";
}
