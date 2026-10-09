import { screen } from "@testing-library/react-native";
import { Image } from "react-native";

import ArtworkScreen from "@/app/request/artwork";
import { useCart } from "@/store/cart";

import {
  DOCX_TYPE,
  docxDetected,
  documentCart,
  documentLine,
  mockUpdateCartLine,
  renderInSafeArea,
  uploadMock,
} from "../../test/artworkPagesFixtures";
import { agreeArtworkRights } from "@/test/legalGate";

jest.mock("expo-router", () => ({
  useFocusEffect: () => undefined,
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), navigate: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({ lineId: "cline_1" }),
}));

jest.mock("@/hooks/useArtworkUpload", () => ({
  useArtworkUpload: (initial?: { fileId?: string | null }) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { uploadHookState } = require("../../test/artworkPagesFixtures");
    return uploadHookState(initial);
  },
}));

jest.mock("@/lib/api", () => ({
  ...jest.requireActual("@/lib/api"),
  getFileDownloadUrl: jest.fn(async () => ({ url: "https://example.test/thesis.docx" })),
  getFile: jest.fn(async (fileId: string) => ({
    fileId,
    originalFilename: "thesis.docx",
    detectedContentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    size: 40_960,
  })),
  updateCartLine: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require("@/lib/api");

beforeEach(() => {
  // The per-order artwork box, ticked by the client (one press per test).
  agreeArtworkRights("cart:cart_1");
  jest.spyOn(Image, "getSize").mockImplementation(() => undefined);
  uploadMock.fileId = "file_docx";
  uploadMock.fileName = "thesis.docx";
  uploadMock.contentType = DOCX_TYPE;
  mockUpdateCartLine(api);
});

it("asks for the total when a Word file did not say how many pages it has", async () => {
  uploadMock.detected = docxDetected(null);
  useCart.setState({
    cartId: "cart_1",
    cart: documentCart({ lines: [documentLine({ artworkFileId: "file_docx", measurement: null, lineSubtotalMinor: null })] }),
    loading: false,
    busy: false,
    error: null,
  });
  await renderInSafeArea(<ArtworkScreen />);

  expect(screen.getByText("How many pages does your file have?")).toBeTruthy();
  expect(screen.getByLabelText("Total pages in this file").props.value).toBe("");
  expect(screen.queryByText(/Upload a document with a readable page count/)).toBeNull();
  // Nothing to price from yet, so checkout waits for the count.
  expect(screen.getByLabelText("Go to checkout").props.accessibilityState.disabled).toBe(true);
  // A Word file is named with a document mark, never sent to Image to measure.
  expect(screen.getAllByLabelText("Word document").length).toBeGreaterThan(0);
  expect(screen.getAllByText("thesis.docx").length).toBeGreaterThan(0);
  expect(Image.getSize).not.toHaveBeenCalled();
});

it("treats an entered total like a counted file: ranges, copies and checkout", async () => {
  uploadMock.detected = docxDetected(null);
  useCart.setState({
    cartId: "cart_1",
    cart: documentCart({
      lines: [documentLine({
        artworkFileId: "file_docx",
        measurement: { pages: 12 },
        documentPages: { total: 12, range: null, printed: 12 },
        lineSubtotalMinor: 7_200,
      })],
    }),
    loading: false,
    busy: false,
    error: null,
  });
  await renderInSafeArea(<ArtworkScreen />);

  expect(screen.getByText("12 pages in this file")).toBeTruthy();
  expect(screen.getByLabelText("Total pages in this file").props.value).toBe("12");
  expect(screen.queryByText("Save page count")).toBeNull();
  expect(screen.getByLabelText("Pages to print")).toBeTruthy();
  expect(screen.getByText("All 12 pages · 12 per copy")).toBeTruthy();
  expect(screen.getByLabelText("Go to checkout").props.accessibilityState.disabled).toBe(false);
});

it("keeps a Word file's own count read-only, as it does a PDF's", async () => {
  uploadMock.detected = docxDetected(8);
  useCart.setState({
    cartId: "cart_1",
    cart: documentCart({
      lines: [documentLine({
        artworkFileId: "file_docx",
        measurement: { pages: 8 },
        documentPages: { total: 8, range: null, printed: 8 },
        lineSubtotalMinor: 4_800,
      })],
    }),
    loading: false,
    busy: false,
    error: null,
  });
  await renderInSafeArea(<ArtworkScreen />);

  expect(screen.getByText("8 pages in this file")).toBeTruthy();
  expect(screen.getByText("Read from your file. Copies are set at checkout.")).toBeTruthy();
  expect(screen.queryByLabelText("Total pages in this file")).toBeNull();
  expect(screen.getByLabelText("Go to checkout").props.accessibilityState.disabled).toBe(false);
});
