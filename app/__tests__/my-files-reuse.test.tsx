import { fireEvent, screen, waitFor } from "@testing-library/react-native";

import MyFilesScreen from "@/app/my-files";
import { useMyFiles } from "@/store/myFiles";

import { renderScreen } from "../../test/renderScreen";
import { savedFile, savedFilesPage } from "../../test/myFilesFixtures";

const mockPush = jest.fn();

jest.mock("expo-router", () => ({
  useFocusEffect: (effect: () => void | (() => void)) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useEffect } = require("react");
    useEffect(effect, [effect]);
  },
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));

jest.mock("@/lib/api", () => ({ ...jest.requireActual("@/lib/api"), listSavedFiles: jest.fn() }));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require("@/lib/api");

// One press per file (AGENTS.md).
it("holds the file for a new order and starts one", async () => {
  useMyFiles.getState().reset();
  api.listSavedFiles.mockResolvedValue(savedFilesPage([savedFile()]));
  await renderScreen(<MyFilesScreen />);

  fireEvent.press(await screen.findByLabelText("Use on a new order: opening-banner.png"));

  await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/request/category"));
  expect(useMyFiles.getState().held).toEqual({ fileId: "file_banner", name: "opening-banner.png", contentType: "image/png" });
});
