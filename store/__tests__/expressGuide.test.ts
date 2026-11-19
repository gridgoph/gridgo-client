import * as api from "@/lib/api";
import { SAMPLE_FILE } from "@/lib/expressGuide";
import { useExpress } from "@/store/express";
import { useExpressGuide } from "@/store/expressGuide";

jest.mock("@/lib/api", () => {
  const actual = jest.requireActual("@/lib/api");
  return {
    ...actual,
    getExpressGuide: jest.fn(),
    updateExpressGuide: jest.fn(),
    listExpressShops: jest.fn(),
    createExpressDraft: jest.fn(),
    uploadFile: jest.fn(),
  };
});

const FLAGS: api.ExpressGuide = {
  missions: { added: false },
  popupLastShownDate: null,
  guideSeen: false,
  guideCompleted: false,
  showPopup: true,
};

beforeEach(async () => {
  jest.clearAllMocks();
  jest.mocked(api.getExpressGuide).mockResolvedValue(FLAGS);
  jest.mocked(api.updateExpressGuide).mockImplementation(async (action) => ({
    ...FLAGS,
    guideSeen: action === "guide_seen" || action === "guide_completed",
    guideCompleted: action === "guide_completed",
  }));
  useExpressGuide.getState().reset();
  useExpress.getState().reset();
  await useExpressGuide.getState().load("user_1");
});

describe("the guide's flags are GRIDGO's", () => {
  it("Skip marks the guide seen, not completed", async () => {
    useExpressGuide.getState().start();
    useExpressGuide.getState().skip();
    expect(useExpressGuide.getState().progress).toBeNull();
    expect(api.updateExpressGuide).toHaveBeenCalledWith("guide_seen", undefined);
    expect(useExpressGuide.getState().guide).toMatchObject({ guideSeen: true, guideCompleted: false });
  });

  it("finishing marks it completed", () => {
    useExpressGuide.getState().start();
    useExpressGuide.getState().finish();
    expect(api.updateExpressGuide).toHaveBeenCalledWith("guide_completed", undefined);
    expect(useExpressGuide.getState().guide).toMatchObject({ guideSeen: true, guideCompleted: true });
  });

  it("records the popup for today and holds it for this launch", () => {
    useExpressGuide.getState().popupShown();
    expect(api.updateExpressGuide).toHaveBeenCalledWith("popup_shown", undefined);
    expect(useExpressGuide.getState().popupOpened).toBe(true);
    expect(useExpressGuide.getState().guide?.showPopup).toBe(false);
  });

  it("says the guide is unavailable when GRIDGO has no route for it", async () => {
    useExpressGuide.getState().reset();
    jest.mocked(api.getExpressGuide).mockRejectedValueOnce(new Error("404"));
    await useExpressGuide.getState().load("user_2");
    expect(useExpressGuide.getState().unavailable).toBe(true);
  });
});

describe("step one: a file added in Express", () => {
  it("tells GRIDGO about a ready file the client added", () => {
    useExpress.getState().addFile({ ...SAMPLE_FILE, fileId: "file_real" });
    expect(api.updateExpressGuide).toHaveBeenCalledWith("file_added", "file_real");
  });

  it("never reports the guide's sample, and the sample reads and writes nothing", async () => {
    useExpress.getState().startSample();
    const state = useExpress.getState();
    expect(state.sample).toBe(true);
    expect(state.files).toHaveLength(1);
    expect(state.draft.status).toBe("ready");
    await state.refreshDraft();
    await state.loadShops();
    state.upload({ uri: "file:///x.pdf", name: "x.pdf", mimeType: "application/pdf" });
    expect(await state.addSavedFile("file_saved")).toBeNull();
    expect(api.createExpressDraft).not.toHaveBeenCalled();
    expect(api.listExpressShops).not.toHaveBeenCalled();
    expect(api.uploadFile).not.toHaveBeenCalled();
    expect(api.updateExpressGuide).not.toHaveBeenCalled();
  });

  it("drops the sample on reset, so Files is the client's own again", () => {
    useExpress.getState().startSample();
    useExpress.getState().reset();
    expect(useExpress.getState()).toMatchObject({ sample: false, files: [], step: "files" });
  });
});
