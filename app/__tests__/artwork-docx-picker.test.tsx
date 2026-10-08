import { screen } from "@testing-library/react-native";
import { Image } from "react-native";

import ArtworkScreen from "@/app/request/artwork";
import type { FormatGuard } from "@/hooks/useArtworkUpload";
import { useCart } from "@/store/cart";

import {
  DOCUMENT_ITEM,
  DOCX_FORMAT,
  DOCX_TYPE,
  PDF_FORMAT,
  documentCart,
  documentLine,
  renderInSafeArea,
  uploadMock,
} from "../../test/artworkPagesFixtures";

const mockGuards: (FormatGuard | undefined)[] = [];

jest.mock("expo-router", () => ({
  useFocusEffect: () => undefined,
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), navigate: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({ lineId: "cline_1" }),
}));

jest.mock("@/hooks/useArtworkUpload", () => ({
  useArtworkUpload: (initial: { fileId?: string | null } | undefined, guard?: FormatGuard) => {
    mockGuards.push(guard);
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { uploadHookState } = require("../../test/artworkPagesFixtures");
    return uploadHookState(initial);
  },
}));

jest.mock("@/lib/api", () => ({
  ...jest.requireActual("@/lib/api"),
  getFileDownloadUrl: jest.fn(async () => ({ url: "https://example.test/art" })),
  getFile: jest.fn(async () => ({ fileId: "file_x", detectedContentType: "application/pdf", size: 1 })),
  updateCartLine: jest.fn(),
}));

beforeEach(() => {
  jest.spyOn(Image, "getSize").mockImplementation(() => undefined);
  uploadMock.fileId = null;
  uploadMock.detected = null;
  uploadMock.contentType = null;
  useCart.setState({
    cartId: "cart_1",
    cart: documentCart({
      lines: [documentLine({ listing: { ...DOCUMENT_ITEM, name: "Mark Document Printing", acceptedFormats: [PDF_FORMAT, DOCX_FORMAT] } })],
    }),
    loading: false,
    busy: false,
    error: null,
  });
});

it("narrows the picker to PDF and Word, and says so on the card", async () => {
  await renderInSafeArea(<ArtworkScreen />);

  const guard = mockGuards.at(-1);
  expect(guard?.accept).toEqual(["application/pdf", DOCX_TYPE]);
  expect(guard?.check("thesis.docx", DOCX_TYPE)).toBe(true);
  expect(guard?.check("thesis.pdf", "application/pdf")).toBe(true);
  expect(guard?.check("photo.jpg", "image/jpeg")).toBe(false);
  expect(guard?.rejection("photo.jpg")).toBe(
    "Mark Document Printing takes PDF or Word document. photo.jpg is none of those — export it and pick it again.",
  );
  expect(screen.getByLabelText("Choose your artwork file").props.accessibilityHint).toBe(
    "PDF or Word document, up to 200 MB (Word documents up to 16 MB)",
  );
});
