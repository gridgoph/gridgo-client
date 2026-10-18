/**
 * Keeping the approval record as a PDF (gridgo-client#248). GRIDGO renders it
 * from the frozen records on every request and stores no copy; it lists the
 * private signature, photo and artwork by reference rather than embedding them.
 */

import * as api from "@/lib/api";
import { approvalProofFileName } from "@/lib/approvalProof";
import { refusalCode, saveSignedInFile } from "@/lib/fileSave";

export type DownloadResult = { ok: true; message: string | null } | { ok: false; message: string };

export const APPROVAL_DOWNLOAD_NEEDS_REBUILD = "Saving the approval record needs a rebuilt GRIDGO app on this phone.";

function refusedMessage(status: number, body: string): string {
  const code = refusalCode(body);
  if (code === "approval_proof_not_found") return "There is no approval record to download for this order yet.";
  if (status === 401) return "Your session expired. Sign in again, then download.";
  if (status === 403 || code === "forbidden") return "This approval record can only be downloaded by the account that placed the order.";
  return "GRIDGO could not prepare the approval record. Try again in a moment.";
}

export async function downloadApprovalProof(orderId: string): Promise<DownloadResult> {
  try {
    const outcome = await saveSignedInFile(
      await api.approvalProofDownloadRequest(orderId),
      approvalProofFileName(orderId),
      "application/pdf",
    );
    if (outcome.kind === "unavailable") return { ok: false, message: APPROVAL_DOWNLOAD_NEEDS_REBUILD };
    if (outcome.kind === "refused") return { ok: false, message: refusedMessage(outcome.status, outcome.body) };
    return { ok: true, message: outcome.message };
  } catch {
    return { ok: false, message: "GRIDGO could not prepare the approval record. Check your connection and try again." };
  }
}
