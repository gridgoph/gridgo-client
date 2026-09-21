import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import { Image } from "react-native";

import ArtworkScreen from "@/app/request/artwork";
import { useCart } from "@/store/cart";

import {
  documentCart,
  documentLine,
  mockUpdateCartLine,
  pdfDetected,
  renderInSafeArea,
  uploadMock,
} from "../../test/artworkPagesFixtures";

jest.mock("expo-router", () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    navigate: jest.fn(),
    back: jest.fn(),
  }),
  useLocalSearchParams: () => ({ lineId: "cline_1" }),
}));

jest.mock("@/hooks/useArtworkUpload", () => ({
  useArtworkUpload: (initial?: { fileId?: string | null }) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { uploadHookState } = require("../../test/artworkPagesFixtures");
    return uploadHookState(initial);
  },
}));

jest.mock("@/lib/api", () => {
  const actual = jest.requireActual("@/lib/api");
  return {
    ...actual,
    getFileDownloadUrl: jest.fn(async () => ({ url: "https://example.test/art.pdf" })),
    getFile: jest.fn(async (fileId: string) => ({
      fileId,
      originalFilename: "thesis.pdf",
      detectedContentType: "application/pdf",
      size: 48_000,
    })),
    updateCartLine: jest.fn(),
  };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require("@/lib/api");

beforeEach(() => {
  jest.spyOn(Image, "getSize").mockImplementation(() => undefined);
  uploadMock.fileId = "file_pdf";
  uploadMock.detected = pdfDetected({ pageCount: 30 });
  uploadMock.contentType = "application/pdf";
  mockUpdateCartLine(api);
  useCart.setState({
    cartId: "cart_1",
    cart: documentCart({
      lines: [documentLine({ artworkFileId: "file_pdf", measurement: { pages: 30 }, lineSubtotalMinor: 18_000 })],
    }),
    loading: false,
    busy: false,
    error: null,
  });
});

it("lets the client change the page count after it was applied", async () => {
  await renderInSafeArea(<ArtworkScreen />);

  const field = await screen.findByLabelText("How many pages");
  fireEvent.changeText(field, "10");
  fireEvent(field, "endEditing", { nativeEvent: { text: "10" } });

  await waitFor(() => {
    expect(api.updateCartLine).toHaveBeenCalledWith("cart_1", "cline_1", {
      measurement: { pages: 10 },
    });
  });
});
