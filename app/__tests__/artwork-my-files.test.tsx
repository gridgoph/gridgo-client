import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import { Image } from "react-native";

import ArtworkScreen from "@/app/request/artwork";
import { SAVE_TO_MY_FILES_HINT } from "@/lib/myFiles";
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
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require("@/lib/api");

beforeEach(() => {
  jest.spyOn(Image, "getSize").mockImplementation(() => undefined);
  useMyFiles.getState().reset();
  holdShirtLine([FRONT], [storedFile("file_front", "shirt-front.png", { savedAt: null })]);
});

it("offers Save to My files under each uploaded file, off until the client ticks it", async () => {
  await renderInSafeArea(<ArtworkScreen />);

  const tick = screen.getByRole("checkbox", { name: "Save to My files" });
  expect(tick.props.accessibilityState).toMatchObject({ checked: false });
  expect(screen.getByText(SAVE_TO_MY_FILES_HINT)).toBeTruthy();
  expect(screen.getByLabelText("Choose from My files")).toBeTruthy();
});

it("draws no tick on an API without My files", async () => {
  holdShirtLine([FRONT], [storedFile("file_front", "shirt-front.png")]);
  await renderInSafeArea(<ArtworkScreen />);
  expect(screen.queryByRole("checkbox", { name: "Save to My files" })).toBeNull();
});

// One press per file (AGENTS.md): this test goes last.
it("ticking asks GRIDGO to keep the file", async () => {
  const saved = storedFile("file_front", "shirt-front.png", { savedAt: "2026-10-29T10:15:31.000Z" });
  api.setFileSaved.mockResolvedValueOnce({ file: saved, usage: { usedBytes: saved.size, limitBytes: 500_000_000 } });
  await renderInSafeArea(<ArtworkScreen />);

  fireEvent.press(screen.getByRole("checkbox", { name: "Save to My files" }));

  await waitFor(() => expect(api.setFileSaved).toHaveBeenCalledWith("file_front", true));
  await waitFor(() =>
    expect(screen.getByRole("checkbox", { name: "Save to My files" }).props.accessibilityState).toMatchObject({ checked: true }),
  );
});
