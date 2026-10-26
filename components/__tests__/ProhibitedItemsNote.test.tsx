import { fireEvent, render, screen } from "@testing-library/react-native";

import { PROHIBITED_ITEMS_NOTE, ProhibitedItemsNote } from "@/components/legal/ProhibitedItemsNote";
import type { LegalVersion } from "@/lib/api";
import { useLegalLibrary } from "@/store/legalLibrary";

const acceptableUse = {
  id: "ver-au-3",
  documentId: "acceptable-use",
  version: 3,
  title: "Acceptable Use and Artwork Rights",
  audience: "all",
  text: "",
  effectiveAt: "2026-10-01T00:00:00.000Z",
  placeholder: false,
  material: true,
} as LegalVersion;

function library(documents: LegalVersion[]) {
  useLegalLibrary.setState({ documents, status: "ready", readAt: Date.now(), lastLoadFailed: false });
}

describe("ProhibitedItemsNote", () => {
  it("says what cannot be printed, without a link while the policy is not loaded", async () => {
    library([]);
    await render(<ProhibitedItemsNote onOpen={jest.fn()} />);

    expect(screen.getByText(PROHIBITED_ITEMS_NOTE)).toBeTruthy();
    expect(PROHIBITED_ITEMS_NOTE).toMatch(/IDs and official documents/);
    expect(PROHIBITED_ITEMS_NOTE).not.toMatch(/₱|fee/);
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("opens the Acceptable Use and Artwork Rights policy", async () => {
    library([acceptableUse]);
    const onOpen = jest.fn();
    await render(<ProhibitedItemsNote onOpen={onOpen} />);

    fireEvent.press(
      screen.getByLabelText("What GRIDGO cannot print: read the Acceptable Use and Artwork Rights"),
    );

    expect(onOpen).toHaveBeenCalledWith({
      pathname: "/legal/[versionId]",
      params: { versionId: "ver-au-3" },
    });
  });
});
