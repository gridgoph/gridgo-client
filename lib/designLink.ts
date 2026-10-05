import type { AcceptedFormat, ArtworkLink, ArtworkLinkCheck, CartLineRecord } from "@/lib/api";

/**
 * A design link: the artwork kept on Canva, Drive, Dropbox or WeTransfer
 * rather than uploaded as a file.
 *
 * `docs/ORDER_MATCH_API.md#artwork-design-links` in gridgo-api is the
 * contract. Two rules shape everything here:
 *
 * - GRIDGO stores only an HTTPS link, filed under the provider's own format
 *   code where the listing takes it (`canva_link` only for Canva, and so on),
 *   so the field refuses anything else before a round trip rather than after.
 * - A link must pass its check before checkout (gridgo-api#122). Checkout
 *   probes every link again and refuses anything it cannot prove is public —
 *   private, missing, unreachable, or simply inconclusive. So the artwork step
 *   holds a link to the same bar: only a proven-public link goes onto the
 *   line, and anything else is said plainly with the fix, and the upload as
 *   the other way on.
 */

export type LinkProvider = ArtworkLinkCheck["provider"];

const PROVIDER_NAMES: Record<LinkProvider, string> = {
  canva: "Canva",
  google_drive: "Google Drive",
  dropbox: "Dropbox",
  we_transfer: "WeTransfer",
  figma: "Figma",
  other: "Web link",
};

export function providerName(provider: LinkProvider): string {
  return PROVIDER_NAMES[provider] ?? PROVIDER_NAMES.other;
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

/** The same host boundaries gridgo-api files each format under. */
export function providerOf(url: string): LinkProvider {
  const host = hostOf(url);
  if (onDomain(host, "canva.com") || host === "canva.link") return "canva";
  if (host === "drive.google.com" || host === "docs.google.com") return "google_drive";
  if (onDomain(host, "dropbox.com") || onDomain(host, "dropboxusercontent.com")) return "dropbox";
  if (onDomain(host, "wetransfer.com") || host === "we.tl") return "we_transfer";
  if (onDomain(host, "figma.com")) return "figma";
  return "other";
}

/** The format code GRIDGO files each provider's links under. */
const PROVIDER_CODES: Partial<Record<LinkProvider, string>> = {
  canva: "canva_link",
  google_drive: "google_drive",
  dropbox: "dropbox",
  we_transfer: "we_transfer",
};

/** The link formats GRIDGO keeps on an order, in the order a client names them. */
const STORABLE_LINK_CODES = ["canva_link", "google_drive", "dropbox", "we_transfer", "other_link"];

const CODE_NAMES: Record<string, string> = {
  canva_link: "Canva",
  google_drive: "Google Drive",
  dropbox: "Dropbox",
  we_transfer: "WeTransfer",
};

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

function orList(names: string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} or ${names.at(-1)}`;
}

/**
 * How a screen names what the field takes, in a client's words.
 *
 * The platform's display names are "Canva link" and "Other link"; "paste a
 * link from Canva link" is what the listing sheet used to say.
 */
export function designLinkPhrase(formats: AcceptedFormat[]): string {
  const codes = linkCodes(formats);
  const named = STORABLE_LINK_CODES.filter((code) => codes.has(code) && CODE_NAMES[code]).map(
    (code) => CODE_NAMES[code],
  );
  if (codes.has("other_link")) {
    return named.length ? `a ${orList([...named, "other sharing"])} link` : "a sharing link";
  }
  return named.length ? `a ${orList(named)} link` : "";
}

/** Whether the listing takes Canva links, so the hint teaches Canva's own Share menu. */
export function takesCanvaLinks(formats: AcceptedFormat[]): boolean {
  return linkCodes(formats).has("canva_link");
}

export type ParsedDesignLink =
  | { ok: true; link: ArtworkLink; provider: LinkProvider }
  | { ok: false; message: string };

const MAX_URL = 2000;

/**
 * Read what the client pasted into one link this listing takes.
 *
 * A bare `www.canva.com/...` is taken as HTTPS — people copy from the address
 * bar. The format is decided from the address: a Drive link is filed as
 * `google_drive` where the shop takes that, and otherwise as an other link.
 * A `canva.link` short link is a Canva link: gridgo-api resolves it to the
 * full design address, and files it under `canva_link` whatever it was sent
 * as, so it can only go where the shop takes Canva links.
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
  const own = PROVIDER_CODES[provider];
  const shortCanva = hostOf(withScheme) === "canva.link";
  const formatCode =
    own && codes.has(own) ? own : codes.has("other_link") && !shortCanva ? "other_link" : null;
  if (!formatCode) {
    const takes = designLinkPhrase(formats);
    return {
      ok: false,
      message: takes
        ? `This shop takes ${takes}. Paste one of those, or upload the file.`
        : "This shop does not take design links. Upload the file instead.",
    };
  }
  return { ok: true, link: { formatCode, url: withScheme }, provider };
}

/**
 * The link GRIDGO should keep once a check has answered.
 *
 * The checker resolves a `canva.link` short link to the full design address
 * and says which format that is; an older checker sends neither, and a format
 * this listing does not take is ignored rather than sent to be refused.
 */
export function checkedLink(
  pasted: ArtworkLink,
  check: Pick<ArtworkLinkCheck, "url" | "formatCode"> | null | undefined,
  formats: AcceptedFormat[],
): ArtworkLink {
  if (!check?.url?.startsWith("https://")) return pasted;
  const formatCode =
    check.formatCode && linkCodes(formats).has(check.formatCode) ? check.formatCode : pasted.formatCode;
  return { formatCode, url: check.url };
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

/** The other way on, said only where the listing takes a file. */
function orUpload(canUpload: boolean): string {
  return canUpload ? " Or upload the file instead." : "";
}

/**
 * What a check result says to the client.
 *
 * Decided from `access` and `reachable`, never from `message` — the API says
 * its wording may change. Its message is shown only when the link could not be
 * reached, where it is the one thing that says why (a timeout, a bad redirect).
 *
 * Everything short of proven public blocks: checkout refuses an `unknown`
 * link exactly as it refuses a private one, so a warning here would only move
 * the refusal to the moment the client is paying.
 */
export function linkVerdict(
  state: LinkCheckState | null | undefined,
  { canUpload = true }: { canUpload?: boolean } = {},
): LinkVerdict | null {
  if (!state || state.phase === "checking" || state.phase === "unavailable") return null;
  if (state.phase === "failed") {
    return {
      tone: "error",
      title: state.message,
      body: state.blocks ? orUpload(canUpload).trim() || null : `Check it again in a minute.${orUpload(canUpload)}`,
      blocks: true,
    };
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
        title: "This link is private",
        body: `${SHARING_FIX}${orUpload(canUpload)}`,
        blocks: true,
      };
    case "not_found":
      return {
        tone: "error",
        title: "We couldn't open this link",
        body: `Nothing is at that address. Check you copied the whole link, and that the design was not deleted.${orUpload(canUpload)}`,
        blocks: true,
      };
    default:
      return check.reachable
        ? {
            tone: "error",
            title: "We couldn't confirm anyone can open it",
            // The page answered, so there is no reason worth relaying — only
            // the one setting that makes it work.
            body: `Set sharing to Anyone with the link, then check it again.${orUpload(canUpload)}`,
            blocks: true,
          }
        : {
            tone: "error",
            title: "We couldn't open this link",
            body: `${check.message}${orUpload(canUpload)}`.trim(),
            blocks: true,
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

/**
 * The address without its scheme, `www.`, query or fragment, for a line too
 * narrow for all of it. Canva's share links carry a tail of tracking
 * parameters that says nothing to a client about which design it is.
 */
export function linkDisplay(url: string): string {
  return url
    .replace(/[?#].*$/, "")
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/\/$/, "");
}

/** What a basket line carries, in the words of the checkout row. */
export function lineArtworkSummary(line: Pick<CartLineRecord, "artworkFileId" | "artworkLinks">): string {
  const links = lineArtworkLinks(line);
  if (line.artworkFileId && links.length) return `Artwork and ${linkLabel(links[0])} attached`;
  if (line.artworkFileId) return "Artwork attached";
  if (links.length) return `${linkLabel(links[0])} attached`;
  return "No artwork yet";
}

// ---------------------------------------------------------------------------
// Checkout's answer about a line's artwork
// ---------------------------------------------------------------------------

/** What checkout said about a line's artwork, stamped with the artwork it was about. */
export type ArtworkProblem = {
  code: string;
  message: string;
  /** `artworkSignature` of the line when checkout refused it. */
  signature: string;
};

export function checkKey(link: ArtworkLink): string {
  return `${link.formatCode} ${link.url}`;
}

/** The artwork a line carries, as one comparable string. */
export function artworkSignature(line: Pick<CartLineRecord, "artworkFileId" | "artworkLinks">): string {
  return [line.artworkFileId ?? "", ...lineArtworkLinks(line).map(checkKey)].join("|");
}

/** A checkout refusal still about the artwork the line holds now, or null. */
export function currentProblem(
  problems: Record<string, ArtworkProblem>,
  line: Pick<CartLineRecord, "id" | "artworkFileId" | "artworkLinks">,
): ArtworkProblem | null {
  const problem = problems[line.id];
  return problem && problem.signature === artworkSignature(line) ? problem : null;
}

