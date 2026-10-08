import { render } from "@testing-library/react-native";
import { createElement, type ReactElement, type ReactNode } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import type { AcceptedFormat, Cart, CartLineRecord, CatalogItem, DetectedArtwork } from "@/lib/api";
import { useCart } from "@/store/cart";

export const uploadMock: {
  fileId: string | null;
  detected: DetectedArtwork | null;
  contentType: string | null;
  fileName?: string;
} = {
  fileId: null,
  detected: null,
  contentType: null,
};

export const DOCX_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/** The registry rows a PDF/DOCX-only document listing names (gridgo-api#198). */
export const PDF_FORMAT: AcceptedFormat = {
  code: "pdf", displayName: "PDF", inputKind: "file", extensions: ["pdf"], mimeTypes: ["application/pdf"], active: true,
};
export const DOCX_FORMAT: AcceptedFormat = {
  code: "docx", displayName: "Word document", inputKind: "file", extensions: ["docx"], mimeTypes: [DOCX_TYPE], active: true,
};

/** What GRIDGO reads from a Word file: a page count, when Word saved one, and nothing else. */
export function docxDetected(pageCount: number | null): DetectedArtwork {
  return {
    kind: "document",
    pageCount,
    pixelWidth: null,
    pixelHeight: null,
    dpi: null,
    measureUnit: null,
    widthMilli: null,
    heightMilli: null,
    pageSize: null,
    orientation: null,
  };
}

export const DOCUMENT_ITEM: CatalogItem = {
  id: "sci_docs",
  supplierId: "supplier_documents",
  supplierServiceId: "svc",
  categoryCode: "documents_publications",
  subcategoryCode: "document_printing",
  name: "Document printing",
  description: null,
  basePriceMinor: 300,
  fromPriceMinor: 300,
  effectivePriceMinor: 300,
  pricingUnit: "per_page",
  packageQty: null,
  measurementKind: "pages",
  measureUnit: null,
  minimumWidthMilli: null,
  minimumHeightMilli: null,
  minimumLengthMilli: null,
  minimumOrderQuantity: null,
  priceTiers: [],
  speedTiers: [],
  pricingBasis: "per_page",
  turnaroundMode: "override",
  turnaroundHours: 4,
  rush: null,
  acceptedFormats: [],
  photos: [],
  prepSteps: [],
  optionGroups: [],
  version: 1,
  serviceVersion: 1,
};

export function pdfDetected(overrides: Partial<DetectedArtwork> = {}): DetectedArtwork {
  return {
    kind: "pdf",
    pageCount: 30,
    pixelWidth: null,
    pixelHeight: null,
    dpi: null,
    measureUnit: "mm",
    widthMilli: 210000,
    heightMilli: 297000,
    pageSize: "A4",
    orientation: "portrait",
    ...overrides,
  };
}

export function documentLine(overrides: Partial<CartLineRecord> = {}): CartLineRecord {
  return {
    id: "cline_1",
    supplierId: "supplier_documents",
    catalogItemId: "sci_docs",
    quantity: 2,
    optionIds: [],
    measurement: { pages: 1 },
    structuredSpec: { size: "A4" },
    artworkFileId: null,
    mockupFileId: null,
    dropoff: null,
    sortOrder: 0,
    listing: DOCUMENT_ITEM,
    lineSubtotalMinor: 600,
    ...overrides,
  };
}

export function documentCart(overrides: Partial<Cart> = {}): Cart {
  return {
    id: "cart_1",
    state: "draft",
    version: 1,
    serviceLevel: "standard",
    scheduledFor: null,
    fulfillmentMode: "delivery",
    defaultDropoff: null,
    lines: [documentLine()],
    checkedOutOrderId: null,
    createdAt: "2026-08-24T00:00:00.000Z",
    updatedAt: "2026-08-24T00:00:00.000Z",
    ...overrides,
  };
}

export function renderInSafeArea(ui: ReactElement) {
  return render(ui, {
    wrapper: ({ children }: { children: ReactNode }) =>
      createElement(
        SafeAreaProvider,
        {
          initialMetrics: {
            frame: { x: 0, y: 0, width: 390, height: 844 },
            insets: { top: 47, left: 0, right: 0, bottom: 34 },
          },
        },
        children,
      ),
  });
}

export function mockUpdateCartLine(api: { updateCartLine: jest.Mock }) {
  api.updateCartLine.mockImplementation(async (_cartId: string, lineId: string, body: Record<string, unknown>) => {
    const current = useCart.getState().cart ?? documentCart();
    return {
      ...current,
      lines: current.lines.map((entry) =>
        entry.id === lineId
          ? {
              ...entry,
              artworkFileId:
                body.artworkFileId === undefined ? entry.artworkFileId : (body.artworkFileId as string | null),
              documentPages: entry.listing?.pricingUnit === "per_page" && uploadMock.detected?.pageCount
                ? { total: uploadMock.detected.pageCount, range: typeof body.pageRange === "string" ? body.pageRange : null,
                    printed: body.pageRange === "1-4" ? 4 : uploadMock.detected.pageCount } : null,
              measurement: entry.listing?.pricingUnit === "per_page" && uploadMock.detected?.pageCount
                ? { pages: body.pageRange === "1-4" ? 4 : uploadMock.detected.pageCount } : entry.measurement,
            }
          : entry,
      ),
    };
  });
}

export function uploadHookState(initial?: { fileId?: string | null }) {
  const fileId = uploadMock.fileId ?? initial?.fileId ?? null;
  return {
    state: fileId
      ? {
          phase: "stored" as const,
          fileId,
          fileName: uploadMock.fileName ?? "thesis.pdf",
          progress: null,
          error: null,
          size: 48_000,
          contentType: uploadMock.contentType ?? "application/pdf",
          detected: uploadMock.detected,
        }
      : {
          phase: "empty" as const,
          fileId: null,
          fileName: "",
          progress: null,
          error: null,
          size: null,
          contentType: null,
          detected: null,
        },
    pick: jest.fn(),
    retry: jest.fn(),
    cancel: jest.fn(),
    attachTo: jest.fn(),
    reset: jest.fn(),
    adopt: jest.fn(),
  };
}
