import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import { Linking } from "react-native";

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
it("opens a file with no picture on a fresh link, not the expired one in the list", async () => {
  useMyFiles.getState().reset();
  const openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(true);
  api.listSavedFiles.mockResolvedValue(savedFilesPage([savedFile({
  fileId: "file_doc",
  originalFilename: "design.docx",
  detectedContentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  previewUrl: null,
  downloadUrl: "https://storage.test/design.docx?expired-signature",
  expiresAt: "2020-01-01T00:00:00.000Z",
})]));
  api.getFileDownloadUrl.mockResolvedValueOnce({
    fileId: "file_doc",
    url: "https://storage.test/design.docx?fresh-signature",
    expiresAt: "2099-01-01T00:00:00.000Z",
    expiresInSeconds: 300,
  });
  await renderScreen(<MyFilesScreen />);

  fireEvent.press(await screen.findByLabelText("Open design.docx"));

  await waitFor(() => expect(openURL).toHaveBeenCalledWith("https://storage.test/design.docx?fresh-signature"));
  expect(api.getFileDownloadUrl).toHaveBeenCalledWith("file_doc");
  expect(openURL).not.toHaveBeenCalledWith(expect.stringContaining("expired-signature"));
});
