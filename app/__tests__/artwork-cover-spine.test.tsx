import { fireEvent, screen } from "@testing-library/react-native";
import { Image } from "react-native";

import ArtworkScreen from "@/app/request/artwork";
import { agreeArtworkRights } from "@/test/legalGate";

import { BACK, FRONT, holdShirtLine } from "../../test/artworkAttachmentFixtures";
import { renderInSafeArea } from "../../test/artworkPagesFixtures";
import { GIVEN_SPINE, holdBookLine } from "../../test/coverSpineFixtures";

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
 * gridgo-client#247: a hardbound book asks how its cover is made and what its
 * spine says. Renders first; the one interacting test goes last.
 */
describe("ArtworkScreen for a hardbound book", () => {
  it("leaves every other product exactly as it was", async () => {
    holdShirtLine([FRONT, BACK]);
    await renderInSafeArea(<ArtworkScreen />);

    expect(screen.queryByText("COVER AND SPINE")).toBeNull();
    expect(screen.queryByLabelText("Plain cover, text only. No printed design. The cover is lettered with the spine details.")).toBeNull();
  });

  it("offers the three covers and the spine, and never blocks while GRIDGO does not require them", async () => {
    holdBookLine();
    await renderInSafeArea(<ArtworkScreen />);

    expect(screen.getByText("COVER AND SPINE")).toBeTruthy();
    expect(screen.queryByText("Needed to order")).toBeNull();
    for (const label of ["Use the first page of my file", "Upload a separate cover page", "Plain cover, text only"]) {
      expect(screen.getByText(label)).toBeTruthy();
    }
    for (const field of ["Institution code", "Title", "Author", "Month", "Year"]) {
      expect(screen.getByLabelText(field)).toBeTruthy();
    }
    expect(screen.getByLabelText(/^Preview of the spine, top to bottom: nothing typed yet/)).toBeTruthy();
    expect(screen.getByLabelText("Go to checkout").props.accessibilityState).toMatchObject({ disabled: false });
    expect(screen.queryByText("Fill in the cover and spine above to go on.")).toBeNull();
  });

  it("holds checkout while GRIDGO requires the form and it is missing", async () => {
    holdBookLine({ coverSpineRequired: true });
    await renderInSafeArea(<ArtworkScreen />);

    expect(screen.getByText("Needed to order")).toBeTruthy();
    expect(screen.getByLabelText("Go to checkout").props.accessibilityState).toMatchObject({ disabled: true });
    expect(screen.getByText("Fill in the cover and spine above to go on.")).toBeTruthy();
  });

  it("draws the spine GRIDGO holds, top to bottom, with the same details on a plain cover", async () => {
    holdBookLine({ coverSpine: GIVEN_SPINE, coverSpineRequired: true });
    await renderInSafeArea(<ArtworkScreen />);

    expect(
      screen.getByLabelText(
        "Preview of the spine, top to bottom: ABC-CS, Flood Risk Mapping of a River Basin, Sample Author, October 2026. Front cover lettered with the same details.",
      ),
    ).toBeTruthy();
    expect(screen.getByText("Saved. The shop letters your book as shown.")).toBeTruthy();
    expect(screen.getByLabelText("Title").props.value).toBe("Flood Risk Mapping of a River Basin");
    expect(screen.getByLabelText("Go to checkout").props.accessibilityState).toMatchObject({ disabled: false });
  });

  it("asks for the cover page only after the book's own file", async () => {
    holdBookLine({ entries: [], coverSpine: null });
    const { useCoverSpine } = jest.requireActual<typeof import("@/store/coverSpine")>("@/store/coverSpine");
    useCoverSpine.setState({ drafts: { cline_1: { ...emptyDraft(), cover: "separate_file" } } });
    await renderInSafeArea(<ArtworkScreen />);

    expect(screen.getByText("Add your book's file above first, then its cover page.")).toBeTruthy();
    expect(screen.getByText("Upload cover page")).toBeTruthy();
  });

  // Last: the one test that types.
  it("letters the spine as the client types", async () => {
    holdBookLine();
    await renderInSafeArea(<ArtworkScreen />);

    fireEvent.changeText(screen.getByLabelText("Title"), "A Study of Davao Rivers");

    expect(await screen.findByLabelText(/^Preview of the spine, top to bottom: A Study of Davao Rivers\./)).toBeTruthy();
    expect(screen.getByText("Save cover and spine")).toBeTruthy();
  });
});

function emptyDraft() {
  return { cover: null, coverFileId: null, institutionCode: "", title: "", author: "", month: null, year: "" };
}
