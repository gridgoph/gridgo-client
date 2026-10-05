import { ApiError } from "@/lib/api";
import {
  ARTWORK_RETENTION_NOTE,
  artworkDeletionGate,
  deleteArtworkFiles,
  deletionConfirmCopy,
  deletionErrorMessage,
  deletionOutcome,
  removedFileDetail,
} from "@/lib/artworkDeletion";

const refusal = (code: string, status = 409) => new ApiError(status, { error: code });

describe("artworkDeletionGate", () => {
  it.each(["completed", "payout_released"])("offers deletion on a %s job with nothing open", (state) => {
    expect(artworkDeletionGate({ state }, [], [])).toEqual({ kind: "allowed" });
  });

  it.each(["needs_qa", "production", "out_for_delivery", "issue_window_open"])("hides it, with when it opens, on a %s job", (state) => {
    expect(artworkDeletionGate({ state }, [], [])).toEqual({
      kind: "hidden",
      reason: "You can delete your artwork once this job is completed.",
    });
  });

  it("points a cancelled job at GRIDGO, which alone can remove it", () => {
    expect(artworkDeletionGate({ state: "cancelled" }, [], [])).toMatchObject({ kind: "hidden", reason: expect.stringMatching(/only be removed by GRIDGO/) });
  });

  it("blocks while a problem report is open, and not once it is settled", () => {
    expect(artworkDeletionGate({ state: "completed" }, [{ status: "open" }], [])).toMatchObject({ kind: "blocked", reason: expect.stringMatching(/problem report is open/) });
    expect(artworkDeletionGate({ state: "completed" }, [{ status: "resolved" }, { status: "dismissed" }], [])).toEqual({ kind: "allowed" });
  });

  it("blocks while a refund is open, from the order's hold or the refund list", () => {
    expect(artworkDeletionGate({ state: "completed", refundHold: true }, [], [])).toMatchObject({ kind: "blocked", reason: expect.stringMatching(/refund request is open/) });
    expect(artworkDeletionGate({ state: "completed" }, [], [{ status: "requested" }])).toMatchObject({ kind: "blocked" });
    expect(artworkDeletionGate({ state: "completed" }, [], [{ status: "paid" }])).toEqual({ kind: "allowed" });
  });

  it("waits for the report check, and lets the API decide when the check failed", () => {
    expect(artworkDeletionGate({ state: "completed" }, "loading", [])).toMatchObject({ kind: "blocked" });
    expect(artworkDeletionGate({ state: "completed" }, "unavailable", null)).toEqual({ kind: "allowed" });
  });
});

it("states the policy in one calm line", () => {
  expect(ARTWORK_RETENTION_NOTE).toBe("GRIDGO deletes artwork automatically 30 days after a job is completed.");
});

it("asks a specific question that says it cannot be undone and that a reorder needs the file again", () => {
  const one = deletionConfirmCopy("Trade fair flyers", 1);
  expect(one.question).toBe("Delete your artwork for Trade fair flyers?");
  expect(one.body).toMatch(/this file/);
  expect(one.body).toMatch(/This cannot be undone\./);
  expect(one.body).toMatch(/To reorder this job, you will need to upload the file again\./);
  expect(deletionConfirmCopy("Banners", 2).body).toMatch(/these 2 files.*upload the files again\./);
});

describe("deletionErrorMessage", () => {
  it.each([
    ["file_retention_hold", /Something is still open on this job/],
    ["file_in_use", /still used by a job that is not finished/],
    ["forbidden", /Only artwork you uploaded/],
    ["file_state_conflict", /still being saved/],
  ])("words %s", (code, words) => {
    const message = deletionErrorMessage(refusal(code, code === "forbidden" ? 403 : 409));
    expect(message).toMatch(words);
    expect(message).not.toContain(code);
  });

  it("falls back to a recovery line, never a code", () => {
    expect(deletionErrorMessage(refusal("something_new", 400))).toBe("Your artwork could not be deleted. Check your connection and try again.");
    expect(deletionErrorMessage(refusal("boom", 500))).toMatch(/server had a problem/);
  });
});

describe("deleteArtworkFiles", () => {
  it("deletes every file in turn and sorts finished from pending", async () => {
    const del = jest.fn(async (id: string) => ({ state: id === "b" ? "delete_pending" : "deleted" }));
    await expect(deleteArtworkFiles(["a", "b"], del)).resolves.toEqual({ deleted: ["a"], pending: ["b"], error: null });
  });

  it("stops at the first refusal and words it", async () => {
    const del = jest.fn()
      .mockResolvedValueOnce({ state: "deleted" })
      .mockRejectedValueOnce(refusal("file_in_use"));
    const result = await deleteArtworkFiles(["a", "b", "c"], del);
    expect(del).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ deleted: ["a"], pending: [] });
    expect(result.error).toMatch(/still used by a job/);
  });

  it("counts a file that is already gone as deleted", async () => {
    const del = jest.fn().mockRejectedValue(refusal("file_not_found", 404));
    await expect(deleteArtworkFiles(["a"], del)).resolves.toEqual({ deleted: ["a"], pending: [], error: null });
  });
});

describe("deletionOutcome", () => {
  it("says what happened, including a partial refusal", () => {
    expect(deletionOutcome({ deleted: ["a"], pending: [], error: null })).toEqual({
      tone: "success",
      message: "Your artwork is deleted. To reorder this job, upload it again.",
    });
    expect(deletionOutcome({ deleted: [], pending: ["a"], error: null }).tone).toBe("info");
    expect(deletionOutcome({ deleted: ["a"], pending: [], error: "Held." })).toEqual({ tone: "error", message: "One file was deleted. Held." });
    expect(deletionOutcome({ deleted: [], pending: [], error: "Held." })).toEqual({ tone: "error", message: "Held." });
  });
});

it("labels a removed file's row", () => {
  expect(removedFileDetail({ state: "delete_pending" })).toBe("Being deleted");
  expect(removedFileDetail({ state: "deleted", deletedAt: null })).toBe("Deleted");
  expect(removedFileDetail({ state: "deleted", deletedAt: "2026-10-03T02:00:00Z" })).toMatch(/^Deleted .*2026$/);
});
