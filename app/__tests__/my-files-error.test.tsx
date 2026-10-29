import { screen } from "@testing-library/react-native";

import MyFilesScreen from "@/app/my-files";
import { useMyFiles } from "@/store/myFiles";

import { renderScreen } from "../../test/renderScreen";

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

it("shows the loading rows, then a way to try again when the list cannot be read", async () => {
  useMyFiles.getState().reset();
  let fail: (error: unknown) => void = () => undefined;
  api.listSavedFiles.mockReturnValueOnce(new Promise((_, reject) => { fail = reject; }));
  await renderScreen(<MyFilesScreen />);

  expect(screen.getByLabelText("Loading My files")).toBeTruthy();
  fail(new api.ApiError(503, { error: "minio_unavailable" }));
  expect(await screen.findByText("My files not loaded")).toBeTruthy();
  expect(screen.getByText("Try again")).toBeTruthy();
});
