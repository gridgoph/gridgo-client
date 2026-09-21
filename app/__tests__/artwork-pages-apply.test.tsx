import { screen, waitFor } from "@testing-library/react-native";
import { Image } from "react-native";

import ArtworkScreen from "@/app/request/artwork";
import { useCart } from "@/store/cart";

import {
  documentCart,
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
  useCart.setState({ cartId: "cart_1", cart: documentCart(), loading: false, busy: false, error: null });
});

it("writes a 30-page PDF onto a per-page line without tapping Use 30 pages", async () => {
  await renderInSafeArea(<ArtworkScreen />);

  await waitFor(() => {
    expect(api.updateCartLine).toHaveBeenCalledWith(
      "cart_1",
      "cline_1",
      expect.objectContaining({
        artworkFileId: "file_pdf",
        measurement: { pages: 30 },
      }),
    );
  });
  await waitFor(() => {
    expect(useCart.getState().cart?.lines[0].measurement).toEqual({ pages: 30 });
  });
  expect(await screen.findByLabelText("How many pages")).toBeTruthy();
  expect(screen.queryByText("Use 30 pages")).toBeNull();
  expect(screen.queryByText("Print all 30 pages?")).toBeNull();
});
