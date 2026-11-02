import { ApiError } from "@/lib/api";
import { useSampleBatches } from "@/store/sampleBatches";
import { approvedBatch, expiredBatch, sampleBatch } from "@/test/sampleBatch";

jest.mock("@/lib/api", () => {
  const actual = jest.requireActual("@/lib/api");
  return {
    ...actual,
    getSampleBatch: jest.fn(),
    rejectSampleBatch: jest.fn(),
    cancelSampleBatch: jest.fn(),
    createSampleBatchCart: jest.fn(),
  };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require("@/lib/api");

beforeEach(() => {
  jest.clearAllMocks();
  useSampleBatches.getState().reset();
});

/** The sample decisions and the batch order, as the store sends them (gridgo-api#222). */
describe("useSampleBatches", () => {
  it("rejects with the reason and what happens next", async () => {
    const rejected = sampleBatch({
      status: "rejected",
      rejection: { version: 1, reason: "Too dark", next: "resample", at: "2026-11-02T00:00:00.000Z" },
    });
    api.rejectSampleBatch.mockResolvedValue(rejected);

    await expect(useSampleBatches.getState().reject("sbd_1", "Too dark", "resample")).resolves.toBe(true);
    expect(api.rejectSampleBatch).toHaveBeenCalledWith("sbd_1", { reason: "Too dark", next: "resample" });
    expect(useSampleBatches.getState().byId.sbd_1?.status).toBe("rejected");
  });

  it("cancels the draft", async () => {
    api.cancelSampleBatch.mockResolvedValue(sampleBatch({ status: "cancelled" }));
    await expect(useSampleBatches.getState().cancel("sbd_1")).resolves.toBe(true);
    expect(useSampleBatches.getState().byId.sbd_1?.status).toBe("cancelled");
  });

  it("explains an ended hold and re-reads the batch at the chosen quantity", async () => {
    api.createSampleBatchCart.mockRejectedValue(
      new ApiError(409, { error: "sample_hold_expired", details: { heldUntil: "2026-11-01T00:00:00.000Z" } }),
    );
    api.getSampleBatch.mockResolvedValue(expiredBatch());

    await expect(useSampleBatches.getState().orderBatch("sbd_1", "held", 750)).resolves.toBeNull();
    expect(useSampleBatches.getState().actionError).toBe(
      "The held price has ended. You can still order this batch at today's price.",
    );
    expect(api.getSampleBatch).toHaveBeenCalledWith("sbd_1", 750);
    expect(useSampleBatches.getState().busy).toBeNull();
  });

  it("returns the batch basket at the price asked for", async () => {
    api.createSampleBatchCart.mockResolvedValue({ id: "cart_batch" });
    await expect(useSampleBatches.getState().orderBatch("sbd_1", "current", 500)).resolves.toEqual({ id: "cart_batch" });
    expect(api.createSampleBatchCart).toHaveBeenCalledWith("sbd_1", { pricing: "current", quantity: 500 });
  });

  it("keeps a quantity preview the list would otherwise overwrite", async () => {
    const preview = approvedBatch({ heldPrice: { quantity: 1000, clientItemMinor: 400000 } });
    useSampleBatches.setState({ byId: { sbd_1: preview } });
    api.listSampleBatches = jest.fn().mockResolvedValue([approvedBatch()]);
    await useSampleBatches.getState().loadList();
    expect(useSampleBatches.getState().byId.sbd_1?.heldPrice?.quantity).toBe(1000);
  });
});
