import { listLegalDocuments, type LegalVersion } from "@/lib/api";
import { ARTWORK_RIGHTS_UNPUBLISHED, ARTWORK_RIGHTS_UNREAD } from "@/lib/legal";
import { artworkRightsPayload } from "@/store/artworkRights";
import { useLegalLibrary } from "@/store/legalLibrary";

jest.mock("@/lib/api", () => {
  const actual = jest.requireActual("@/lib/api");
  return { ...actual, listLegalDocuments: jest.fn() };
});
jest.mock("@/lib/legalContext", () => ({
  legalContext: async () => ({ app: "gridgo-client/test", device: "client-test" }),
}));

const list = listLegalDocuments as jest.Mock;

const policy: LegalVersion = {
  id: "acceptable-use-1",
  documentId: "acceptable-use",
  version: 1,
  title: "Acceptable Use and Artwork Rights",
  audience: "all",
  text: "Placeholder",
  effectiveAt: "2026-01-01T00:00:00.000Z",
  placeholder: true,
  material: false,
  status: "placeholder",
};

beforeEach(() => {
  list.mockReset();
  useLegalLibrary.setState({ documents: [], status: "idle", readAt: null });
});

describe("artworkRightsPayload", () => {
  it("names the version already in a ready library", async () => {
    useLegalLibrary.setState({ documents: [policy], status: "ready", readAt: Date.now() });
    await expect(artworkRightsPayload()).resolves.toMatchObject({
      accepted: true,
      versionIds: ["acceptable-use-1"],
      method: "checkbox",
      app: "gridgo-client/test",
      device: "client-test",
    });
    expect(list).not.toHaveBeenCalled();
  });

  it("reads the library again when a ready list has no statement", async () => {
    useLegalLibrary.setState({ documents: [], status: "ready", readAt: Date.now() });
    list.mockResolvedValue([policy]);
    await expect(artworkRightsPayload()).resolves.toMatchObject({
      versionIds: ["acceptable-use-1"],
    });
    expect(list).toHaveBeenCalledWith("client");
  });

  it("says the statement is unpublished when the library loads without it", async () => {
    useLegalLibrary.setState({ documents: [], status: "ready", readAt: Date.now() });
    list.mockResolvedValue([]);
    await expect(artworkRightsPayload()).rejects.toThrow(ARTWORK_RIGHTS_UNPUBLISHED);
  });

  it("says to check the connection when the library cannot be loaded", async () => {
    list.mockRejectedValue(new TypeError("Network request failed"));
    await expect(artworkRightsPayload()).rejects.toThrow(ARTWORK_RIGHTS_UNREAD);
  });
});
