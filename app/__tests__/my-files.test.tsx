import { screen } from "@testing-library/react-native";

import MyFilesScreen from "@/app/my-files";
import { ARTWORK_RETENTION_NOTE } from "@/lib/artworkDeletion";
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

jest.mock("@/lib/api", () => ({ ...jest.requireActual("@/lib/api"), listSavedFiles: jest.fn() }));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require("@/lib/api");

beforeEach(() => {
  useMyFiles.getState().reset();
});

it("lists each saved file with its picture, type, size and saved date, and the space used", async () => {
  api.listSavedFiles.mockResolvedValueOnce(
    savedFilesPage([
      savedFile(),
      savedFile({
        fileId: "file_menu",
        originalFilename: "menu.pdf",
        detectedContentType: "application/pdf",
        size: 2_500_000,
        previewUrl: null,
        savedAt: "2026-10-20T02:00:00.000Z",
      }),
    ]),
  );
  await renderScreen(<MyFilesScreen />);

  expect(await screen.findByText("opening-banner.png")).toBeTruthy();
  expect(screen.getByText("PNG image · 48 KB")).toBeTruthy();
  expect(screen.getByText("Saved 29 Oct 2026")).toBeTruthy();
  expect(screen.getByLabelText("Preview of opening-banner.png")).toBeTruthy();
  expect(screen.getByText("menu.pdf")).toBeTruthy();
  expect(screen.getByText("PDF · 2.5 MB")).toBeTruthy();
  expect(screen.getByText("2.5 MB of 500 MB used")).toBeTruthy();
  expect(screen.getByLabelText("Delete opening-banner.png")).toBeTruthy();
  expect(screen.getByLabelText("Use on a new order: menu.pdf")).toBeTruthy();
  expect(screen.getByText(ARTWORK_RETENTION_NOTE)).toBeTruthy();
});

it("invites a first save when nothing is saved", async () => {
  api.listSavedFiles.mockResolvedValueOnce(savedFilesPage([]));
  await renderScreen(<MyFilesScreen />);

  expect(await screen.findByText("Nothing saved yet")).toBeTruthy();
  expect(screen.getByText("Start a print job")).toBeTruthy();
});
