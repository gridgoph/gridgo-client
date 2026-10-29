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
it("asks before deleting, and deletes nothing yet", async () => {
  useMyFiles.getState().reset();
  api.listSavedFiles.mockResolvedValue(savedFilesPage([savedFile()]));
  await renderScreen(<MyFilesScreen />);

  fireEvent.press(await screen.findByLabelText("Delete opening-banner.png"));

  expect(await screen.findByText("Delete opening-banner.png?")).toBeTruthy();
  expect(screen.getByText(/deletes the file itself, not just its place in My files/)).toBeTruthy();
  await waitFor(() => expect(useMyFiles.getState().confirming).toBe("file_banner"));
  expect(api.deleteSavedFile).not.toHaveBeenCalled();
});
