import { render, screen } from "@testing-library/react-native";

import { ArtworkRightsBox } from "@/components/legal/ArtworkRightsBox";
import type { LegalVersion } from "@/lib/api";
import { ARTWORK_RIGHTS_UNPUBLISHED, ARTWORK_RIGHTS_UNREAD } from "@/lib/legal";
import { useLegalLibrary } from "@/store/legalLibrary";

const terms = {
  id: "ver-terms-2",
  documentId: "terms",
  version: 2,
  title: "Terms of Service",
  audience: "client",
  text: "",
  effectiveAt: "2026-10-01T00:00:00.000Z",
  placeholder: false,
  material: true,
} as LegalVersion;

function library(lastLoadFailed: boolean) {
  useLegalLibrary.setState({ documents: [terms], status: "ready", readAt: Date.now(), lastLoadFailed });
}

describe("ArtworkRightsBox", () => {
  it("says the statement could not be read when a refresh failed over other documents", async () => {
    library(true);
    await render(<ArtworkRightsBox scope="cart:c1" onOpen={jest.fn()} />);

    expect(screen.getByText(ARTWORK_RIGHTS_UNREAD)).toBeTruthy();
    expect(screen.queryByText(ARTWORK_RIGHTS_UNPUBLISHED)).toBeNull();
  });

  it("says the statement is unpublished when the library read without it", async () => {
    library(false);
    await render(<ArtworkRightsBox scope="cart:c1" onOpen={jest.fn()} />);

    expect(screen.getByText(ARTWORK_RIGHTS_UNPUBLISHED)).toBeTruthy();
  });
});
