import { fireEvent, screen, waitFor } from "@testing-library/react-native";

import MyFilesScreen from "@/app/my-files";
import { useMyFiles } from "@/store/myFiles";

import { FRONT, holdShirtLine } from "../../test/artworkAttachmentFixtures";
import { documentCart } from "../../test/artworkPagesFixtures";
import { renderScreen } from "../../test/renderScreen";
import { savedFile, savedFilesPage } from "../../test/myFilesFixtures";

const mockBack = jest.fn();

jest.mock("expo-router", () => ({
  useFocusEffect: (effect: () => void | (() => void)) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useEffect } = require("react");
    useEffect(effect, [effect]);
  },
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: mockBack }),
  useLocalSearchParams: () => ({ lineId: "cline_1" }),
}));

jest.mock("@/lib/api", () => ({
  ...jest.requireActual("@/lib/api"),
  listSavedFiles: jest.fn(),
  updateCartLine: jest.fn(),
  getFile: jest.fn(async () => ({})),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require("@/lib/api");

beforeEach(() => {
  useMyFiles.getState().reset();
  holdShirtLine([FRONT]);
  api.listSavedFiles.mockResolvedValue(
    savedFilesPage([
      savedFile(),
      savedFile({ fileId: "file_layers", originalFilename: "layers.psd", detectedContentType: "image/vnd.adobe.photoshop", previewUrl: null }),
    ]),
  );
  api.updateCartLine.mockImplementation(async () => documentCart());
});

it("chooses for the item: says why a file it cannot take is not offered", async () => {
  await renderScreen(<MyFilesScreen />);

  expect(await screen.findByLabelText("Add to this item: opening-banner.png")).toBeTruthy();
  expect(screen.getByLabelText("Add to this item: layers.psd").props.accessibilityState).toMatchObject({ disabled: true });
  expect(screen.getByText("T-shirts does not take this kind of file.")).toBeTruthy();
  expect(screen.queryByLabelText("Delete opening-banner.png")).toBeNull();
});

// One press per file (AGENTS.md): this test goes last.
it("puts the saved file on the item and goes back to the Artwork step", async () => {
  await renderScreen(<MyFilesScreen />);

  fireEvent.press(await screen.findByLabelText("Add to this item: opening-banner.png"));

  await waitFor(() =>
    expect(api.updateCartLine).toHaveBeenCalledWith("cart_1", "cline_1", {
      artworkAttachments: [FRONT, { kind: "file", fileId: "file_banner" }],
    }),
  );
  await waitFor(() => expect(mockBack).toHaveBeenCalled());
});
