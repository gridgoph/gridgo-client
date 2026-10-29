import { fireEvent, screen } from "@testing-library/react-native";

import MyFilesScreen from "@/app/my-files";
import { useMyFiles } from "@/store/myFiles";

import { renderScreen } from "../../test/renderScreen";
import { savedFile, savedFilesPage } from "../../test/myFilesFixtures";

jest.mock("expo-router", () => ({
  useFocusEffect: (effect: () => void | (() => void)) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useEffect } = require("react");
    useEffect(effect, [effect]);
  },
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));

jest.mock("@/lib/api", () => ({
  ...jest.requireActual("@/lib/api"),
  listSavedFiles: jest.fn(),
  getFileDownloadUrl: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require("@/lib/api");

// One press per file (AGENTS.md).
it("says when a file did not open and offers to try again", async () => {
  useMyFiles.getState().reset();
  api.listSavedFiles.mockResolvedValue(savedFilesPage([savedFile({
  fileId: "file_doc",
  originalFilename: "design.docx",
  detectedContentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  previewUrl: null,
  downloadUrl: "https://storage.test/design.docx?expired-signature",
  expiresAt: "2020-01-01T00:00:00.000Z",
})]));
  api.getFileDownloadUrl.mockRejectedValueOnce(new TypeError("Network request failed"));
  await renderScreen(<MyFilesScreen />);

  fireEvent.press(await screen.findByLabelText("Open design.docx"));

  expect(await screen.findByText("This file did not open. Check your connection and try again.")).toBeTruthy();
  expect(screen.getByLabelText("Try opening design.docx")).toBeTruthy();
});
