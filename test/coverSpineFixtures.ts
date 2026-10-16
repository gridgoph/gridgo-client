import type { ArtworkAttachment, CatalogItem, CoverSpineRecord } from "@/lib/api";
import { useArtworkAttachments } from "@/store/artworkAttachments";
import { useCart } from "@/store/cart";
import { useCoverSpine } from "@/store/coverSpine";
import { useDesignLink } from "@/store/designLink";

import { storedFile } from "./artworkAttachmentFixtures";
import { DOCUMENT_ITEM, documentCart, documentLine } from "./artworkPagesFixtures";

/** A hardbound listing: GRIDGO asks its cover and spine (gridgo-api#249). */
export const HARDBOUND_ITEM: CatalogItem = {
  ...DOCUMENT_ITEM,
  id: "sci_hardbound",
  subcategoryCode: "binding_hardbound",
  name: "Hardbound thesis",
  coverSpineForm: true,
};

export const BOOK_FILE: ArtworkAttachment = { kind: "file", fileId: "file_book" };

export const GIVEN_SPINE: CoverSpineRecord = {
  status: "given",
  cover: "text_only",
  coverFileId: null,
  spine: { institutionCode: "ABC-CS", title: "Flood Risk Mapping of a River Basin", author: "Sample Author", month: 10, year: 2026 },
  spineDate: "October 2026",
  spineSummary: "ABC-CS | Flood Risk Mapping of a River Basin | Sample Author | October 2026",
};

/** A book in the basket with its file on it, and the cover and spine as given. */
export function holdBookLine({
  coverSpine = null,
  coverSpineRequired = false,
  entries = [BOOK_FILE],
}: { coverSpine?: CoverSpineRecord | null; coverSpineRequired?: boolean; entries?: ArtworkAttachment[] } = {}): void {
  useDesignLink.getState().reset();
  useArtworkAttachments.getState().reset();
  useCoverSpine.getState().reset();
  useArtworkAttachments.setState({ files: { file_book: storedFile("file_book", "thesis.pdf") } });
  useCart.setState({
    cartId: "cart_1",
    cart: documentCart({
      lines: [
        documentLine({
          catalogItemId: HARDBOUND_ITEM.id,
          listing: HARDBOUND_ITEM,
          artworkFileId: entries.find((entry) => entry.kind === "file")?.fileId ?? null,
          artworkAttachments: entries,
          documentPages: { total: 80, range: null, printed: 80 },
          coverSpine,
          coverSpineRequired,
        }),
      ],
    }),
    loading: false,
    busy: false,
    error: null,
  });
}
