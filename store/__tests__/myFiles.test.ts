import * as api from "@/lib/api";
import { useArtworkAttachments } from "@/store/artworkAttachments";
import { useCart } from "@/store/cart";
import { useMyFiles } from "@/store/myFiles";

import { FRONT, holdShirtLine, storedFile } from "../../test/artworkAttachmentFixtures";
import { LIMIT_REACHED_BODY, savedFile, savedFilesPage } from "../../test/myFilesFixtures";

jest.mock("@/lib/api", () => {
  const actual = jest.requireActual("@/lib/api");
  return {
    ...actual,
    listSavedFiles: jest.fn(),
    setFileSaved: jest.fn(),
    deleteSavedFile: jest.fn(),
    updateCartLine: jest.fn(),
    getFile: jest.fn(),
  };
});

const listSavedFiles = api.listSavedFiles as jest.MockedFunction<typeof api.listSavedFiles>;
const setFileSaved = api.setFileSaved as jest.MockedFunction<typeof api.setFileSaved>;
const deleteSavedFile = api.deleteSavedFile as jest.MockedFunction<typeof api.deleteSavedFile>;
const updateCartLine = api.updateCartLine as jest.MockedFunction<typeof api.updateCartLine>;
const getFile = api.getFile as jest.MockedFunction<typeof api.getFile>;

const usage = { usedBytes: 1_480_000, limitBytes: 500_000_000 };

beforeEach(() => {
  jest.clearAllMocks();
  useMyFiles.getState().reset();
  holdShirtLine([FRONT], [storedFile("file_front", "shirt-front.png", { savedAt: null })]);
});

describe("Save to My files", () => {
  it("ticking saves the file and the box follows GRIDGO's record", async () => {
    const saved = storedFile("file_front", "shirt-front.png", { savedAt: "2026-10-29T10:15:31.000Z" });
    setFileSaved.mockResolvedValueOnce({ file: saved, usage });

    const pending = useMyFiles.getState().setSaved("file_front", true);
    expect(useMyFiles.getState().pendingSave).toEqual({ file_front: true });
    await expect(pending).resolves.toBe(true);

    expect(setFileSaved).toHaveBeenCalledWith("file_front", true);
    expect(useArtworkAttachments.getState().files.file_front?.savedAt).toBe("2026-10-29T10:15:31.000Z");
    expect(useMyFiles.getState().pendingSave).toEqual({});
    expect(useMyFiles.getState().usage).toEqual(usage);
  });

  it("a full library leaves the file unsaved and says how much is used", async () => {
    setFileSaved.mockRejectedValueOnce(new api.ApiError(409, LIMIT_REACHED_BODY));

    await expect(useMyFiles.getState().setSaved("file_front", true)).resolves.toBe(false);

    expect(useArtworkAttachments.getState().files.file_front?.savedAt).toBeNull();
    expect(useMyFiles.getState().pendingSave).toEqual({});
    expect(useMyFiles.getState().saveError.file_front).toMatch(
      /^My files is full: you have used 490 MB of 500 MB, and this file needs 20 MB\. Delete saved files/,
    );
  });

  it("unticking takes the file out of the list without deleting it", async () => {
    useMyFiles.setState({ files: [savedFile({ fileId: "file_front" }), savedFile({ fileId: "file_other" })] });
    setFileSaved.mockResolvedValueOnce({ file: storedFile("file_front", "shirt-front.png", { savedAt: null }), usage });

    await useMyFiles.getState().setSaved("file_front", false);

    expect(useMyFiles.getState().files?.map((file) => file.fileId)).toEqual(["file_other"]);
    expect(deleteSavedFile).not.toHaveBeenCalled();
  });
});

describe("the list", () => {
  it("reads the saved files and their usage", async () => {
    listSavedFiles.mockResolvedValueOnce(savedFilesPage([savedFile()], { nextOffset: 50 }));
    await useMyFiles.getState().load();
    expect(useMyFiles.getState()).toMatchObject({ nextOffset: 50, error: null, loading: false });
    expect(useMyFiles.getState().files).toHaveLength(1);
  });

  it("says when it could not be read", async () => {
    listSavedFiles.mockRejectedValueOnce(new api.ApiError(503, { error: "minio_unavailable" }));
    await useMyFiles.getState().load();
    expect(useMyFiles.getState().files).toBeNull();
    expect(useMyFiles.getState().error).toEqual(expect.any(String));
  });
});

describe("deleting", () => {
  it("asks first, then deletes and frees the space", async () => {
    useMyFiles.setState({ files: [savedFile()], usage: { usedBytes: 48_231, limitBytes: 500_000_000 } });
    deleteSavedFile.mockResolvedValueOnce({
      file: storedFile("file_banner", "opening-banner.png", { state: "deleted", savedAt: null }),
      usage: { usedBytes: 0, limitBytes: 500_000_000 },
    });

    useMyFiles.getState().askDelete("file_banner");
    expect(deleteSavedFile).not.toHaveBeenCalled();
    await expect(useMyFiles.getState().confirmDelete()).resolves.toBe(true);

    expect(deleteSavedFile).toHaveBeenCalledWith("file_banner");
    expect(useMyFiles.getState()).toMatchObject({ files: [], usage: { usedBytes: 0 }, confirming: null });
  });

  it("keeps the file and says why when an order still needs it", async () => {
    useMyFiles.setState({ files: [savedFile()] });
    deleteSavedFile.mockRejectedValueOnce(new api.ApiError(409, { error: "file_in_use" }));

    useMyFiles.getState().askDelete("file_banner");
    await useMyFiles.getState().confirmDelete();

    expect(useMyFiles.getState().files).toHaveLength(1);
    expect(useMyFiles.getState().deleteError).toMatch(/basket or on an order that is not finished/);
  });
});

describe("reuse", () => {
  it("puts a saved file on the item without uploading it", async () => {
    const cart = useCart.getState().cart!;
    const after = { ...cart, lines: [{ ...cart.lines[0], artworkAttachments: [FRONT, { kind: "file" as const, fileId: "file_banner" }] }] };
    updateCartLine.mockResolvedValueOnce(after);
    getFile.mockResolvedValueOnce(storedFile("file_banner", "opening-banner.png", { savedAt: "2026-10-29T10:15:31.000Z" }));

    const result = await useArtworkAttachments.getState().attachSaved("cline_1", "file_banner");

    expect(result).toEqual({ ok: true });
    expect(updateCartLine).toHaveBeenCalledWith(
      "cart_1",
      "cline_1",
      expect.objectContaining({
        artworkAttachments: [FRONT, { kind: "file", fileId: "file_banner" }],
      }),
    );
  });

  it("will not add the same file twice", async () => {
    const result = await useArtworkAttachments.getState().attachSaved("cline_1", "file_front");
    expect(result).toEqual({ ok: false, message: "That file is already on this item." });
    expect(updateCartLine).not.toHaveBeenCalled();
  });

  it("holds a file for the next Artwork step until it is added or put away", () => {
    useMyFiles.getState().hold({ fileId: "file_banner", name: "opening-banner.png", contentType: "image/png" });
    expect(useMyFiles.getState().held?.fileId).toBe("file_banner");
    useMyFiles.getState().release();
    expect(useMyFiles.getState().held).toBeNull();
  });
});
