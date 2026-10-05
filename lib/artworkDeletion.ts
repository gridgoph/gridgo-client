/**
 * A client deleting their own artwork once a job is done (gridgo-api#131,
 * `DELETE /files/:fileId` in gridgo-api `docs/STORAGE_API.md`).
 *
 * The server is the gate: it refuses while any order using the file is not
 * completed, while the file is in a basket, and while an issue, claim, refund,
 * dispute or pickup escalation is open. This module only decides what the
 * order screen offers before asking, from what the client can see — the state,
 * their own issue reports and refund requests — and words every refusal.
 */

import { ApiError, type Issue, type Order, type Refund, type StoredFile } from "@/lib/api";
import { userFacingError } from "@/lib/copy";
import { isRefundActive } from "@/lib/refunds";

/** The retention period decided on 4 October 2026. Policy, not a setting. */
export const ARTWORK_RETENTION_DAYS = 30;

/** The one calm line on a completed order. */
export const ARTWORK_RETENTION_NOTE =
  `GRIDGO deletes artwork automatically ${ARTWORK_RETENTION_DAYS} days after a job is completed.`;

export const DELETE_ARTWORK_LABEL = "Delete my artwork";

const COMPLETED_STATES = ["completed", "payout_released"];
const SETTLED_ISSUE_STATUSES = ["resolved", "dismissed"];

/** What the client's issue reports on this order are known to be. */
export type IssueRead = readonly Pick<Issue, "status">[] | "loading" | "unavailable";

export type ArtworkDeletionGate =
  /** Offer the action. */
  | { kind: "allowed" }
  /** Show the action, disabled, with the reason under it. */
  | { kind: "blocked"; reason: string }
  /** No action at all; the reason is the one line in its place. */
  | { kind: "hidden"; reason: string };

export function isOrderCompleted(order: Pick<Order, "state">): boolean {
  return COMPLETED_STATES.includes(order.state);
}

export function hasOpenIssue(issues: readonly Pick<Issue, "status">[]): boolean {
  return issues.some((issue) => !SETTLED_ISSUE_STATUSES.includes(issue.status));
}

/**
 * Whether "Delete my artwork" is offered on this order.
 *
 * An issue list that could not be read does not block: the API rechecks every
 * hold and its refusal is worded below, so a failed read costs nothing but a
 * round trip. Holds the client cannot see (a claim, a dispute) reach them the
 * same way.
 */
export function artworkDeletionGate(
  order: Pick<Order, "state" | "refundHold">,
  issues: IssueRead,
  refunds: readonly Pick<Refund, "status">[] | null | undefined,
): ArtworkDeletionGate {
  if (order.state === "cancelled") {
    return {
      kind: "hidden",
      reason: "Artwork on a cancelled job can only be removed by GRIDGO. Message GRIDGO if you want it gone.",
    };
  }
  if (!isOrderCompleted(order)) {
    return { kind: "hidden", reason: "You can delete your artwork once this job is completed." };
  }
  if (order.refundHold || (refunds ?? []).some(isRefundActive)) {
    return {
      kind: "blocked",
      reason: "A refund request is open on this job, so your artwork is kept until Operations decides it.",
    };
  }
  if (issues === "loading") return { kind: "blocked", reason: "Checking this job for open reports…" };
  if (issues !== "unavailable" && hasOpenIssue(issues)) {
    return {
      kind: "blocked",
      reason: "A problem report is open on this job, so your artwork is kept until Operations settles it.",
    };
  }
  return { kind: "allowed" };
}

/** The question and its consequence, said before anything is sent. */
export function deletionConfirmCopy(title: string, files: number): { question: string; body: string } {
  const what = files === 1 ? "this file" : `these ${files} files`;
  const again = files === 1 ? "the file" : "the files";
  return {
    question: `Delete your artwork for ${title}?`,
    body: `GRIDGO permanently deletes ${what}. This cannot be undone. To reorder this job, you will need to upload ${again} again.`,
  };
}

function errorCode(error: unknown): string | null {
  if (!(error instanceof ApiError)) return null;
  const body = error.body;
  return typeof body === "object" && body && "error" in body ? String((body as { error: unknown }).error) : error.message;
}

/** A refusal in words the client can act on. Never a code. */
export function deletionErrorMessage(error: unknown): string {
  switch (errorCode(error)) {
    case "file_retention_hold":
      return "Something is still open on this job — a report, a refund or a claim — so your artwork is kept until Operations settles it.";
    case "file_in_use":
      return "This file is still used by a job that is not finished, or by your basket, so it cannot be deleted yet. Try again once that job is completed.";
    case "forbidden":
      return "Only artwork you uploaded can be deleted here. Message GRIDGO to remove a file they added.";
    case "file_state_conflict":
      return "This file is still being saved. Pull the order down to refresh, then try again.";
    default:
      return userFacingError(error, "Your artwork could not be deleted. Check your connection and try again.");
  }
}

export type DeletionResult = {
  /** Gone, or already gone. */
  deleted: string[];
  /** A case opened while storage was being cleared; GRIDGO finishes it later. */
  pending: string[];
  /** The first refusal, worded. Files after it are not tried. */
  error: string | null;
};

/**
 * Delete each file in turn. The first refusal stops the rest: the reasons are
 * shared by every file on the order, so asking again would only repeat it.
 */
export async function deleteArtworkFiles(
  fileIds: readonly string[],
  deleteFile: (fileId: string) => Promise<Pick<StoredFile, "state">>,
): Promise<DeletionResult> {
  const result: DeletionResult = { deleted: [], pending: [], error: null };
  for (const fileId of fileIds) {
    try {
      const file = await deleteFile(fileId);
      (file.state === "delete_pending" ? result.pending : result.deleted).push(fileId);
    } catch (error) {
      if (errorCode(error) === "file_not_found") {
        result.deleted.push(fileId);
        continue;
      }
      result.error = deletionErrorMessage(error);
      break;
    }
  }
  return result;
}

/** The line that replaces the button once the client has asked. */
export function deletionOutcome(result: DeletionResult): { tone: "success" | "info" | "error"; message: string } {
  const done = result.deleted.length + result.pending.length;
  if (result.error) {
    return {
      tone: "error",
      message: done ? `${done === 1 ? "One file was" : `${done} files were`} deleted. ${result.error}` : result.error,
    };
  }
  if (result.pending.length) {
    return {
      tone: "info",
      message: "Your artwork is set to be deleted. Something opened on this job just now, so GRIDGO finishes once it is settled.",
    };
  }
  return { tone: "success", message: "Your artwork is deleted. To reorder this job, upload it again." };
}

/** The detail line on a file row whose bytes are gone. */
export function removedFileDetail(file: Pick<StoredFile, "state" | "deletedAt">): string {
  if (file.state === "delete_pending") return "Being deleted";
  const at = file.deletedAt ? new Date(file.deletedAt) : null;
  if (!at || !Number.isFinite(at.getTime())) return "Deleted";
  return `Deleted ${at.toLocaleDateString("en-PH", { timeZone: "Asia/Manila", day: "numeric", month: "short", year: "numeric" })}`;
}
