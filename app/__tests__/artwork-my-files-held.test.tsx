import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import { Image } from "react-native";

import ArtworkScreen from "@/app/request/artwork";
import { heldFileLine } from "@/lib/myFiles";
import { useMyFiles } from "@/store/myFiles";

import { FRONT, holdShirtLine, storedFile } from "../../test/artworkAttachmentFixtures";
import { documentCart, renderInSafeArea } from "../../test/artworkPagesFixtures";

jest.mock("expo-router", () => ({
  useFocusEffect: () => undefined,
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), navigate: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({ lineId: "cline_1" }),
}));

jest.mock("@/lib/api", () => ({
  ...jest.requireActual("@/lib/api"),
  getFileDownloadUrl: jest.fn(async () => ({ url: "https://example.test/art.png" })),
  getFile: jest.fn(async () => ({})),
  updateCartLine: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require("@/lib/api");

beforeEach(() => {
  jest.spyOn(Image, "getSize").mockImplementation(() => undefined);
  useMyFiles.getState().reset();
  useMyFiles.getState().hold({ fileId: "file_banner", name: "opening-banner.png", contentType: "image/png" });
  holdShirtLine([FRONT], [storedFile("file_front", "shirt-front.png", { savedAt: null })]);
  api.updateCartLine.mockImplementation(async () => documentCart());
});

it("offers the file chosen in My files on the next Artwork step", async () => {
  await renderInSafeArea(<ArtworkScreen />);
  expect(screen.getByText(heldFileLine("opening-banner.png"))).toBeTruthy();
  expect(screen.getByText("Add to this item")).toBeTruthy();
});

// One press per file (AGENTS.md): this test goes last.
it("adds the saved file to the item without uploading it again", async () => {
  await renderInSafeArea(<ArtworkScreen />);

  fireEvent.press(screen.getByText("Add to this item"));

  await waitFor(() =>
    expect(api.updateCartLine).toHaveBeenCalledWith("cart_1", "cline_1", {
      artworkAttachments: [FRONT, { kind: "file", fileId: "file_banner" }],
    }),
  );
  await waitFor(() => expect(useMyFiles.getState().held).toBeNull());
});
