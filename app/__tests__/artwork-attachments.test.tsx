import { screen } from "@testing-library/react-native";
import { Image } from "react-native";

import ArtworkScreen from "@/app/request/artwork";
import { checkKey } from "@/lib/designLink";
import { useArtworkAttachments } from "@/store/artworkAttachments";
import { useDesignLink } from "@/store/designLink";
import { agreeArtworkRights } from "@/test/legalGate";

import { BACK, FRONT, LINK, LOGO, holdShirtLine, storedFile } from "../../test/artworkAttachmentFixtures";
import { renderInSafeArea } from "../../test/artworkPagesFixtures";

jest.mock("expo-router", () => ({
  useFocusEffect: () => undefined,
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), navigate: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({ lineId: "cline_1" }),
}));

jest.mock("@/lib/api", () => ({
  ...jest.requireActual("@/lib/api"),
  getFileDownloadUrl: jest.fn(async () => ({ url: "https://example.test/art.png" })),
  getFile: jest.fn(async () => {
    throw new Error("read from the store");
  }),
  checkArtworkLink: jest.fn(async () => null),
  updateCartLine: jest.fn(),
}));

beforeEach(() => {
  agreeArtworkRights("cart:cart_1");
  jest.spyOn(Image, "getSize").mockImplementation(() => undefined);
});

/**
 * Report C6625C57: a shirt design plus a separate high-resolution logo could
 * not both go on one item. Every test renders a state; none presses.
 */
describe("ArtworkScreen with several files and links", () => {
  it("lists every file and link in order, with its label, its status and the main file marked", async () => {
    holdShirtLine([FRONT, LOGO, BACK, LINK]);
    useDesignLink.setState({
      checks: { [checkKey({ formatCode: "canva_link", url: "https://www.canva.com/design/DAF1/view" })]: {
        phase: "checked",
        check: { ok: true, reachable: true, httpStatus: 200, provider: "canva", access: "public_view", message: "" },
      } },
    });
    await renderInSafeArea(<ArtworkScreen />);

    for (const name of ["shirt-front.png", "logo-hires.pdf", "shirt-back.png"]) {
      expect(screen.getAllByText(name).length).toBeGreaterThan(0);
    }
    expect(screen.getByText("PDF · 2.1 MB")).toBeTruthy();
    expect(screen.getAllByText("Uploaded and checked")).toHaveLength(3);
    expect(screen.getByText("Anyone with the link can view it")).toBeTruthy();
    expect(screen.getByText("Main file")).toBeTruthy();
    expect(screen.getByLabelText("Label for shirt-front.png").props.value).toBe("Front");
    expect(screen.getByLabelText("Label for shirt-back.png").props.value).toBe("");
    expect(screen.getByLabelText("Label for Canva link").props.value).toBe("Logo design");
    // Each row says its place, and the ends cannot move further.
    expect(screen.getByLabelText("Move Front up").props.accessibilityState).toMatchObject({ disabled: true });
    expect(screen.getByLabelText("Move Logo design down").props.accessibilityState).toMatchObject({ disabled: true });
    expect(screen.getByLabelText("Remove Logo PDF")).toBeTruthy();
    // The limit, as a meter and in words.
    expect(screen.getByLabelText("4 of 10 files and links used")).toBeTruthy();
    expect(screen.getByText("6 more files or links can go on this item.")).toBeTruthy();
    expect(screen.getByLabelText("Add more files")).toBeTruthy();
    expect(screen.getByText("Add a design link")).toBeTruthy();
    expect(screen.getByLabelText("Go to checkout").props.accessibilityState).toMatchObject({ disabled: false });
  });

  it("stops offering more at ten, and says why", async () => {
    const ten = Array.from({ length: 10 }, (_, index) => ({ kind: "file" as const, fileId: `file_${index}` }));
    holdShirtLine(ten, ten.map((entry, index) => storedFile(entry.fileId, `page-${index}.png`)));
    await renderInSafeArea(<ArtworkScreen />);

    expect(screen.getByLabelText("10 of 10 files and links used")).toBeTruthy();
    expect(
      screen.getByText("This item has 10 files and links, the most it can take. Remove one to add another."),
    ).toBeTruthy();
    expect(screen.getByLabelText("Add more files").props.accessibilityState).toMatchObject({ disabled: true });
    expect(screen.queryByLabelText("Design link")).toBeNull();
  });

  it("shows each upload's own progress, and holds checkout until every one lands", async () => {
    holdShirtLine([FRONT]);
    useArtworkAttachments.setState({
      uploads: {
        cline_1: [
          { key: "u1", phase: "sending", fileName: "sleeve.png", progress: 0.4, error: null, fileId: null, refusal: null },
          { key: "u2", phase: "saving", fileName: "collar.png", progress: 1, error: null, fileId: null, refusal: null },
        ],
      },
    });
    await renderInSafeArea(<ArtworkScreen />);

    expect(screen.getByText("Uploading — 40%")).toBeTruthy();
    expect(screen.getByText("Sent. GRIDGO is still saving it — keep this screen open.")).toBeTruthy();
    expect(screen.getByLabelText("Cancel uploading sleeve.png")).toBeTruthy();
    expect(screen.getByLabelText("3 of 10 files and links used")).toBeTruthy();
    expect(screen.getByLabelText("Go to checkout").props.accessibilityState).toMatchObject({ disabled: true });
    expect(screen.getByText("Checkout opens when every upload has finished.")).toBeTruthy();
  });

  it("names a file GRIDGO cannot print from on its own row, and holds checkout", async () => {
    holdShirtLine([FRONT, BACK], [
      storedFile("file_front", "shirt-front.png"),
      storedFile("file_back", "shirt-back.png", { artworkCheck: { status: "failed", message: "The image is cut off." } }),
    ]);
    await renderInSafeArea(<ArtworkScreen />);

    expect(screen.getByText("GRIDGO cannot print from this file")).toBeTruthy();
    expect(screen.getByText(/The image is cut off\./)).toBeTruthy();
    expect(screen.getByLabelText("Go to checkout").props.accessibilityState).toMatchObject({ disabled: true });
    expect(screen.getByText("Remove the file GRIDGO cannot print from, or upload a new export.")).toBeTruthy();
  });

  it("keeps a failed upload off the item with its reason and a way to try again", async () => {
    holdShirtLine([FRONT]);
    useArtworkAttachments.setState({
      uploads: {
        cline_1: [{
          key: "u1", phase: "failed", fileName: "back.png", progress: null,
          error: "The upload stopped. Check your connection and try again.", fileId: null, refusal: null,
        }],
      },
    });
    await renderInSafeArea(<ArtworkScreen />);

    expect(screen.getByText("Not added to this item")).toBeTruthy();
    expect(screen.getByLabelText("Try back.png again")).toBeTruthy();
    expect(screen.getByLabelText("Remove back.png")).toBeTruthy();
    // It is not on the item, so it neither counts nor holds checkout.
    expect(screen.getByLabelText("1 of 10 files and links used")).toBeTruthy();
    expect(screen.getByLabelText("Go to checkout").props.accessibilityState).toMatchObject({ disabled: false });
  });
});
