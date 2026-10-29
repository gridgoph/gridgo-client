import { fireEvent, screen, waitFor } from "@testing-library/react-native";

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

jest.mock("@/lib/api", () => ({ ...jest.requireActual("@/lib/api"), listSavedFiles: jest.fn(), deleteSavedFile: jest.fn() }));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require("@/lib/api");

// One press per file (AGENTS.md).
it("deletes the file once confirmed and frees its space", async () => {
  useMyFiles.getState().reset();
  api.listSavedFiles.mockResolvedValue(savedFilesPage([savedFile()]));
  api.deleteSavedFile.mockResolvedValueOnce({
    file: { fileId: "file_banner", state: "deleted" },
    usage: { usedBytes: 0, limitBytes: 500_000_000 },
  });
  await renderScreen(<MyFilesScreen />);
  await screen.findByText("opening-banner.png");
  useMyFiles.getState().askDelete("file_banner");

  fireEvent.press(await screen.findByText("Delete file"));

  await waitFor(() => expect(api.deleteSavedFile).toHaveBeenCalledWith("file_banner"));
  expect(await screen.findByText("Nothing saved yet")).toBeTruthy();
  expect(useMyFiles.getState().usage).toEqual({ usedBytes: 0, limitBytes: 500_000_000 });
});
