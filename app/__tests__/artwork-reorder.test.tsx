import { screen, waitFor } from "@testing-library/react-native";
import { Image } from "react-native";

import ArtworkScreen from "@/app/request/artwork";
import { reorderAnswers } from "@/lib/reorder";
import { useReorderJob, type ReorderFile } from "@/store/reorderJob";
import { CURRENT_FLOW_ORDER } from "@/test/reorderFixtures";

import { FRONT, holdShirtLine, storedFile } from "../../test/artworkAttachmentFixtures";
import { documentCart, renderInSafeArea } from "../../test/artworkPagesFixtures";

jest.mock("expo-router", () => ({
  useFocusEffect: () => undefined,
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), navigate: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({ lineId: "cline_1" }),
}));

jest.mock("@/lib/api", () => ({
  ...jest.requireActual("@/lib/api"),
  getFileDownloadUrl: jest.fn(async () => ({ url: "https://example.test/art.png" })),
  getFile: jest.fn(async () => ({})),
  updateCartLine: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require("@/lib/api");

const KEPT: ReorderFile = { fileId: "file_banner", name: "opening-banner.png", contentType: "image/png" };

function startJob(lineId: string | null, files: ReorderFile[] | null) {
  useReorderJob.getState().start({
    subcategory: "flyers",
    answers: reorderAnswers(CURRENT_FLOW_ORDER),
    files,
    lineId,
    artworkNote: null,
  });
}

beforeEach(() => {
  jest.spyOn(Image, "getSize").mockImplementation(() => undefined);
  holdShirtLine([FRONT], [storedFile("file_front", "shirt-front.png", { savedAt: null })]);
  api.updateCartLine.mockReset();
  api.updateCartLine.mockImplementation(async () => documentCart());
  useReorderJob.getState().clear();
});

it("puts a repeated job's kept file on its line, unasked, and says where it came from", async () => {
  startJob("cline_1", [KEPT]);

  await renderInSafeArea(<ArtworkScreen />);

  await waitFor(() =>
    expect(api.updateCartLine).toHaveBeenCalledWith("cart_1", "cline_1", {
      artworkAttachments: [FRONT, { kind: "file", fileId: "file_banner" }],
    }),
  );
  expect(await screen.findByText(/opening-banner\.png came from your past order/)).toBeTruthy();
  expect(api.updateCartLine).toHaveBeenCalledTimes(1);
  expect(useReorderJob.getState().job?.files).toEqual([]);
});

it("waits for the file read that is still on its way", async () => {
  startJob("cline_1", null);

  await renderInSafeArea(<ArtworkScreen />);

  expect(api.updateCartLine).not.toHaveBeenCalled();
});

it("leaves a line that is not the job's alone", async () => {
  startJob("cline_other", [KEPT]);

  await renderInSafeArea(<ArtworkScreen />);

  expect(api.updateCartLine).not.toHaveBeenCalled();
  expect(useReorderJob.getState().job?.files).toEqual([KEPT]);
});
