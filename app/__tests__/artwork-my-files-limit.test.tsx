import { fireEvent, screen } from "@testing-library/react-native";
import { Image } from "react-native";

import ArtworkScreen from "@/app/request/artwork";
import { useMyFiles } from "@/store/myFiles";

import { FRONT, holdShirtLine, storedFile } from "../../test/artworkAttachmentFixtures";
import { renderInSafeArea } from "../../test/artworkPagesFixtures";
import { LIMIT_REACHED_BODY } from "../../test/myFilesFixtures";

jest.mock("expo-router", () => ({
  useFocusEffect: () => undefined,
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), navigate: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({ lineId: "cline_1" }),
}));

jest.mock("@/lib/api", () => ({
  ...jest.requireActual("@/lib/api"),
  getFileDownloadUrl: jest.fn(async () => ({ url: "https://example.test/art.png" })),
  setFileSaved: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require("@/lib/api");

beforeEach(() => {
  jest.spyOn(Image, "getSize").mockImplementation(() => undefined);
  useMyFiles.getState().reset();
  holdShirtLine([FRONT], [storedFile("file_front", "shirt-front.png", { savedAt: null })]);
});

// One press per file (AGENTS.md).
it("a full library says how much is used and leaves the box unticked", async () => {
  api.setFileSaved.mockRejectedValueOnce(new api.ApiError(409, LIMIT_REACHED_BODY));
  await renderInSafeArea(<ArtworkScreen />);

  fireEvent.press(screen.getByRole("checkbox", { name: "Save to My files" }));

  expect(
    await screen.findByText(
      "My files is full: you have used 490 MB of 500 MB, and this file needs 20 MB. Delete saved files you no longer need to free space, then tick it again.",
    ),
  ).toBeTruthy();
  expect(screen.getByRole("checkbox", { name: "Save to My files" }).props.accessibilityState).toMatchObject({
    checked: false,
    disabled: false,
  });
});
