import { act, renderHook, waitFor } from "@testing-library/react-native";

import { useReorder } from "@/hooks/useReorder";
import { useJobFulfilment } from "@/store/jobFulfilment";
import { useListingDraft } from "@/store/listingDraft";
import { useReorderJob } from "@/store/reorderJob";
import { useRequestDraft } from "@/store/requestDraft";
import {
  CURRENT_FLOW_ORDER,
  expectCurrentFlowFlyers,
  KEPT_FILE,
  NO_CODE_ORDER,
  OLD_SHAPE_ORDER,
  resetReorder,
} from "@/test/reorderFixtures";

const mockPush = jest.fn();

jest.mock("expo-router", () =>
  jest.requireActual("@/test/reorderFixtures").reorderRouter((href: unknown) => mockPush(href)),
);
jest.mock("@/lib/api", () => jest.requireActual("@/test/reorderFixtures").reorderApiMock());

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require("@/lib/api");

beforeEach(() => {
  mockPush.mockClear();
  api.getFile.mockReset();
  api.getFile.mockResolvedValue(KEPT_FILE);
  api.listCatalog.mockClear();
  resetReorder();
});

async function reorder(order: Parameters<ReturnType<typeof useReorder>["reorder"]>[0]) {
  const { result } = await renderHook(() => useReorder());
  await act(() => result.current.reorder(order));
}

describe("useReorder", () => {
  it("starts the current flow on GRIDGO's product code, and writes nothing to the old form", async () => {
    await reorder(CURRENT_FLOW_ORDER);

    expectCurrentFlowFlyers(mockPush);
    expect(api.listCatalog).not.toHaveBeenCalled();
  });

  it("brings the artwork along while GRIDGO keeps it", async () => {
    await reorder(CURRENT_FLOW_ORDER);

    await waitFor(() =>
      expect(useReorderJob.getState().job?.files).toEqual([
        { fileId: "file_flyer", name: "flyer.pdf", contentType: "application/pdf" },
      ]),
    );
  });

  it.each([
    ["deleted", { ...KEPT_FILE, state: "deleted" }],
    ["another kind of file", { ...KEPT_FILE, purpose: "payment_proof" }],
    ["failed its check", { ...KEPT_FILE, artworkCheck: { status: "failed", code: "image_too_small" } }],
  ])("leaves a file off when it is %s", async (_label, file) => {
    api.getFile.mockResolvedValue(file);

    await reorder(CURRENT_FLOW_ORDER);

    await waitFor(() => expect(useReorderJob.getState().job?.files).toEqual([]));
  });

  it("leaves the file off when it cannot be read, and the job still starts", async () => {
    api.getFile.mockRejectedValue(new Error("gone"));

    await reorder(CURRENT_FLOW_ORDER);

    expectCurrentFlowFlyers(mockPush);
    await waitFor(() => expect(useReorderJob.getState().job?.files).toEqual([]));
  });

  it("does not hand a slow file read to a later job", async () => {
    let answer: (file: unknown) => void = () => undefined;
    api.getFile.mockReturnValue(new Promise((resolve) => (answer = resolve)));

    await reorder(CURRENT_FLOW_ORDER);
    useReorderJob.getState().clear();
    await act(async () => answer(KEPT_FILE));

    expect(useReorderJob.getState().job).toBeNull();
  });

  it("clears answers an earlier job left on a sheet", async () => {
    useListingDraft.getState().keep("sci_flyers", {
      selection: { grp: "opt" },
      quantity: 9,
      measured: { width: "", height: "", length: "", pages: "" },
      note: "",
      layout: null,
    });

    await reorder(CURRENT_FLOW_ORDER);

    expect(useListingDraft.getState().drafts).toEqual({});
  });

  it("maps an order with no product code by its product family, keeping the rest", async () => {
    await reorder(OLD_SHAPE_ORDER);

    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/request/when",
      params: { subcategory: "tarpaulin", category: "signage" },
    });
    expect(useReorderJob.getState().job?.answers).toEqual(
      expect.objectContaining({ quantity: 3, options: [
        { groupName: null, label: "3x6 ft" },
        { groupName: null, label: "13oz tarpaulin" },
      ] }),
    );
    expect(useJobFulfilment.getState().choice).toBeNull();
    expect(useRequestDraft.getState().title).toBe("");
  });

  it("lets the client choose when nothing says which product it was", async () => {
    await reorder(NO_CODE_ORDER);

    expect(mockPush).toHaveBeenCalledWith("/request/category");
    expect(useReorderJob.getState().job).toBeNull();
    expect(useRequestDraft.getState().title).toBe("");
  });

  it("starts one job from a double tap", async () => {
    const { result } = await renderHook(() => useReorder());

    await act(async () => {
      await Promise.all([result.current.reorder(CURRENT_FLOW_ORDER), result.current.reorder(CURRENT_FLOW_ORDER)]);
    });

    expect(mockPush).toHaveBeenCalledTimes(1);
  });
});
