import { fireEvent, screen } from "@testing-library/react-native";
import { Image } from "react-native";

import ArtworkScreen from "@/app/request/artwork";
import { SAVE_UNCONFIRMED } from "@/lib/myFiles";
import { useMyFiles } from "@/store/myFiles";

import { FRONT, holdShirtLine, storedFile } from "../../test/artworkAttachmentFixtures";
import { renderInSafeArea } from "../../test/artworkPagesFixtures";

jest.mock("expo-router", () => ({
  useFocusEffect: () => undefined,
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), navigate: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({ lineId: "cline_1" }),
}));

jest.mock("@/lib/api", () => ({
  ...jest.requireActual("@/lib/api"),
  getFileDownloadUrl: jest.fn(async () => ({ url: "https://example.test/art.png" })),
  setFileSaved: jest.fn(),
  getFile: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require("@/lib/api");

beforeEach(() => {
  jest.spyOn(Image, "getSize").mockImplementation(() => undefined);
  useMyFiles.getState().reset();
  holdShirtLine([FRONT], [storedFile("file_front", "shirt-front.png", { savedAt: null })]);
});

// One press per file (AGENTS.md).
it("a lost answer is said as not confirmed, with a way to check again — never as not saved", async () => {
  api.setFileSaved.mockRejectedValueOnce(new TypeError("Network request failed"));
  api.getFile.mockRejectedValue(new TypeError("Network request failed"));
  await renderInSafeArea(<ArtworkScreen />);

  fireEvent.press(screen.getByRole("checkbox", { name: "Save to My files" }));

  expect(await screen.findByText(SAVE_UNCONFIRMED)).toBeTruthy();
  expect(screen.getByText("Not confirmed yet")).toBeTruthy();
  expect(screen.getByLabelText("Check again")).toBeTruthy();
  expect(screen.queryByText(/was not saved to My files/)).toBeNull();
});
