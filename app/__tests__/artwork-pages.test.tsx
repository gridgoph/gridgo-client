import { screen } from "@testing-library/react-native";
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
  // The first-order tour registers its screen on focus (`useTourScreen`).
  useFocusEffect: () => undefined,
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
  uploadMock.detected = pdfDetected({ pageCount: null });
  uploadMock.contentType = "application/pdf";
  mockUpdateCartLine(api);
  useCart.setState({
    cartId: "cart_1",
    cart: documentCart({
      lines: [documentLine({ artworkFileId: "file_pdf", measurement: null })],
    }),
    loading: false,
    busy: false,
    error: null,
  });
});

it("blocks checkout when a per-page PDF has no readable count and no pages", async () => {
  await renderInSafeArea(<ArtworkScreen />);

  expect(screen.getByText(/Upload a document with a readable page count/)).toBeTruthy();
  expect(screen.queryByLabelText("How many pages")).toBeNull();
  expect(screen.getByLabelText("Go to checkout").props.accessibilityState.disabled).toBe(true);
});
