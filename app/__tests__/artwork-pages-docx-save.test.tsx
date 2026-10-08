import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import { Image } from "react-native";

import ArtworkScreen from "@/app/request/artwork";
import { useCart } from "@/store/cart";

import {
  DOCX_TYPE,
  docxDetected,
  documentCart,
  documentLine,
  renderInSafeArea,
  uploadMock,
} from "../../test/artworkPagesFixtures";

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
  jest.spyOn(Image, "getSize").mockImplementation(() => undefined);
  uploadMock.fileId = "file_docx";
  uploadMock.fileName = "thesis.docx";
  uploadMock.contentType = DOCX_TYPE;
  uploadMock.detected = docxDetected(null);
  // GRIDGO answers an entered total the way it answers a counted file.
  api.updateCartLine.mockImplementation(async (_cartId: string, lineId: string, body: { measurement?: { pages: number } }) => {
    const current = useCart.getState().cart ?? documentCart();
    const pages = body.measurement?.pages ?? 0;
    return {
      ...current,
      lines: current.lines.map((entry) => entry.id === lineId
        ? { ...entry, measurement: { pages }, documentPages: { total: pages, range: null, printed: pages }, lineSubtotalMinor: pages * 600 }
        : entry),
    };
  });
  useCart.setState({
    cartId: "cart_1",
    cart: documentCart({ lines: [documentLine({ artworkFileId: "file_docx", measurement: null, lineSubtotalMinor: null })] }),
    loading: false,
    busy: false,
    error: null,
  });
});

it("sends the typed total as the line's pages and prices from it", async () => {
  await renderInSafeArea(<ArtworkScreen />);

  fireEvent.changeText(screen.getByLabelText("Total pages in this file"), "12");
  await waitFor(() => expect(screen.getByLabelText("Total pages in this file").props.value).toBe("12"));
  fireEvent.press(screen.getByText("Save page count"));

  await waitFor(() => {
    expect(api.updateCartLine).toHaveBeenCalledWith("cart_1", "cline_1", { measurement: { pages: 12 } });
  });
  await waitFor(() => {
    expect(useCart.getState().cart?.lines[0].documentPages).toEqual({ total: 12, range: null, printed: 12 });
  });
  expect(await screen.findByText("12 pages in this file")).toBeTruthy();
});
