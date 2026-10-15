import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import { Image } from "react-native";

import ArtworkScreen from "@/app/request/artwork";

import { BACK, FRONT, LOGO, holdShirtLine } from "../../test/artworkAttachmentFixtures";
import { documentCart, renderInSafeArea } from "../../test/artworkPagesFixtures";

jest.mock("expo-router", () => ({
  useFocusEffect: () => undefined,
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), navigate: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({ lineId: "cline_1" }),
}));

jest.mock("@/lib/api", () => ({
  ...jest.requireActual("@/lib/api"),
  getFileDownloadUrl: jest.fn(async () => ({ url: "https://example.test/art.png" })),
  updateCartLine: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require("@/lib/api");

beforeEach(() => {
  jest.spyOn(Image, "getSize").mockImplementation(() => undefined);
  holdShirtLine([FRONT, BACK, LOGO]);
  api.updateCartLine.mockImplementation(async () => documentCart());
});

// One press per file (AGENTS.md).
it("moves the logo up one place and sends the whole list in its new order", async () => {
  await renderInSafeArea(<ArtworkScreen />);

  fireEvent.press(screen.getByLabelText("Move Logo PDF up"));

  await waitFor(() => {
    expect(api.updateCartLine).toHaveBeenCalledWith("cart_1", "cline_1", {
      artworkAttachments: [
        { kind: "file", fileId: "file_front", label: "Front" },
        { kind: "file", fileId: "file_logo", label: "Logo PDF" },
        { kind: "file", fileId: "file_back" },
      ],
    });
  });
});
