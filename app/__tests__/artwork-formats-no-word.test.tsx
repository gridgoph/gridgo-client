import { fireEvent, screen } from "@testing-library/react-native";
import { Image } from "react-native";

import ArtworkScreen from "@/app/request/artwork";
import type { FormatGuard } from "@/hooks/useArtworkUpload";
import type { AcceptedFormat } from "@/lib/api";
import { useCart } from "@/store/cart";

import {
  DOCUMENT_ITEM,
  DOCX_TYPE,
  PDF_FORMAT,
  documentCart,
  documentLine,
  captureGuards,
  renderInSafeArea,
  uploadMock,
} from "../../test/artworkPagesFixtures";

// A flyer shop that prints from images and PDF, and never from Word (gridgo-client#227).
const JPEG_FORMAT: AcceptedFormat = {
  code: "jpeg", displayName: "JPEG", inputKind: "file", extensions: ["jpg", "jpeg"], mimeTypes: ["image/jpeg"], active: true,
};
const PNG_FORMAT: AcceptedFormat = {
  code: "png", displayName: "PNG", inputKind: "file", extensions: ["png"], mimeTypes: ["image/png"], active: true,
};

const mockGuards: (FormatGuard | undefined)[] = [];

jest.mock("expo-router", () => ({
  useFocusEffect: () => undefined,
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), navigate: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({ lineId: "cline_1" }),
}));

jest.mock("@/lib/api", () => ({
  ...jest.requireActual("@/lib/api"),
  getFileDownloadUrl: jest.fn(async () => ({ url: "https://example.test/art" })),
  getFile: jest.fn(async () => ({ fileId: "file_x", detectedContentType: "application/pdf", size: 1 })),
  updateCartLine: jest.fn(),
}));

beforeEach(() => {
  jest.spyOn(Image, "getSize").mockImplementation(() => undefined);
  // The picker filter is handed over when the client chooses files.
  captureGuards(mockGuards);
  uploadMock.fileId = null;
  uploadMock.detected = null;
  uploadMock.contentType = null;
  useCart.setState({
    cartId: "cart_1",
    cart: documentCart({
      lines: [documentLine({
        listing: { ...DOCUMENT_ITEM, name: "Flyers", pricingUnit: "per_unit", acceptedFormats: [JPEG_FORMAT, PDF_FORMAT, PNG_FORMAT] },
      })],
    }),
    loading: false,
    busy: false,
    error: null,
  });
});

it("lists the accepted types and says Word is not one of them before the picker opens", async () => {
  await renderInSafeArea(<ArtworkScreen />);

  expect(screen.getByText("Accepted files")).toBeTruthy();
  for (const name of ["JPEG", "PDF", "PNG"]) expect(screen.getByText(name)).toBeTruthy();
  expect(screen.getByText("Up to 200 MB.")).toBeTruthy();
  expect(
    screen.getByText("Flyers does not take Word files. Save your document as a PDF first, then choose the PDF."),
  ).toBeTruthy();

  fireEvent.press(screen.getByLabelText("Choose files"));
  const guard = mockGuards.at(-1);
  expect(guard?.accept).toEqual(["image/jpeg", "application/pdf", "image/png"]);
  expect(guard?.check("thesis.docx", DOCX_TYPE)).toBe(false);
  expect(guard?.rejection("thesis.docx", DOCX_TYPE)).toBe(
    "Flyers does not take Word files. It takes JPEG, PDF or PNG. Save thesis.docx as a PDF, then choose the PDF.",
  );
});
