import type { AcceptedFormat, ArtworkAttachment, CatalogItem, StoredFile } from "@/lib/api";
import { useArtworkAttachments } from "@/store/artworkAttachments";
import { useCart } from "@/store/cart";
import { useDesignLink } from "@/store/designLink";

import { DOCUMENT_ITEM, PDF_FORMAT, documentCart, documentLine } from "./artworkPagesFixtures";

export const PNG_FORMAT: AcceptedFormat = {
  code: "png", displayName: "PNG", inputKind: "file", extensions: ["png"], mimeTypes: ["image/png"], active: true,
};
export const CANVA_FORMAT: AcceptedFormat = {
  code: "canva_link", displayName: "Canva link", inputKind: "url", extensions: [], mimeTypes: [], active: true,
};

/** A shirt listing that takes PNG, PDF and Canva links, priced per piece. */
export const SHIRT_ITEM: CatalogItem = {
  ...DOCUMENT_ITEM,
  id: "sci_shirts",
  subcategoryCode: "t_shirts",
  name: "T-shirts",
  pricingUnit: "per_unit",
  measurementKind: "none",
  acceptedFormats: [PNG_FORMAT, PDF_FORMAT, CANVA_FORMAT],
};

export const FRONT: ArtworkAttachment = { kind: "file", fileId: "file_front", label: "Front" };
export const BACK: ArtworkAttachment = { kind: "file", fileId: "file_back" };
export const LOGO: ArtworkAttachment = { kind: "file", fileId: "file_logo", label: "Logo PDF" };
export const LINK: ArtworkAttachment = {
  kind: "link", formatCode: "canva_link", url: "https://www.canva.com/design/DAF1/view", label: "Logo design",
};

export function storedFile(fileId: string, name: string, overrides: Partial<StoredFile> = {}): StoredFile {
  const pdf = name.endsWith(".pdf");
  return {
    fileId,
    purpose: "artwork",
    originalFilename: name,
    declaredContentType: pdf ? "application/pdf" : "image/png",
    detectedContentType: pdf ? "application/pdf" : "image/png",
    size: pdf ? 2_202_009 : 1_480_000,
    ownerId: "user_client",
    state: "ready",
    createdAt: "2026-10-15T00:00:00.000Z",
    readyAt: "2026-10-15T00:00:00.000Z",
    references: [],
    artworkCheck: { status: "passed" },
    ...overrides,
  };
}

/** An item holding `entries`, with each file's record already read. */
export function holdShirtLine(entries: ArtworkAttachment[], files: StoredFile[] = defaultFiles()): void {
  useDesignLink.getState().reset();
  useArtworkAttachments.getState().reset();
  useArtworkAttachments.setState({ files: Object.fromEntries(files.map((file) => [file.fileId, file])) });
  useCart.setState({
    cartId: "cart_1",
    cart: documentCart({
      lines: [
        documentLine({
          catalogItemId: SHIRT_ITEM.id,
          listing: SHIRT_ITEM,
          measurement: null,
          artworkFileId: entries.find((entry) => entry.kind === "file")?.fileId ?? null,
          artworkLinks: entries.flatMap((entry) => (entry.kind === "link" ? [{ formatCode: entry.formatCode, url: entry.url }] : [])),
          artworkAttachments: entries,
        }),
      ],
    }),
    loading: false,
    busy: false,
    error: null,
  });
}

function defaultFiles(): StoredFile[] {
  return [
    storedFile("file_front", "shirt-front.png"),
    storedFile("file_back", "shirt-back.png"),
    storedFile("file_logo", "logo-hires.pdf"),
  ];
}
