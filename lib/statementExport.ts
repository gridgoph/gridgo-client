/**
 * Keeping an organization statement as a PDF or CSV (gridgo-client#160).
 *
 * The export is a signed-in GET, saved the way `lib/fileSave.ts` saves any
 * file GRIDGO hands only to a signed-in person.
 */

import * as api from "@/lib/api";
import type { StatementPeriod } from "@/lib/api";
import { refusalCode, saveSignedInFile } from "@/lib/fileSave";
import { organizationErrorMessage } from "@/lib/organization";

export type ExportFormat = "pdf" | "csv";

export type ExportResult = { ok: true; message: string | null } | { ok: false; message: string };

export const EXPORT_NEEDS_REBUILD = "Saving a statement needs a rebuilt GRIDGO app on this phone.";

const MIME: Record<ExportFormat, string> = { pdf: "application/pdf", csv: "text/csv" };

export function statementFileName(
  period: { from: string; to: string },
  format: ExportFormat,
): string {
  return `organization-statement-${period.from}-${period.to}.${format}`;
}

function failure(status: number, body: string): ExportResult {
  return {
    ok: false,
    message:
      organizationErrorMessage(refusalCode(body)) ??
      (status === 401
        ? "Your session expired. Sign in again, then export."
        : "GRIDGO could not prepare that file. Try again in a moment."),
  };
}

export async function exportStatement(
  period: StatementPeriod,
  range: { from: string; to: string },
  format: ExportFormat,
): Promise<ExportResult> {
  const name = statementFileName(range, format);
  try {
    const outcome = await saveSignedInFile(await api.statementExportRequest(period, format), name, MIME[format]);
    if (outcome.kind === "unavailable") return { ok: false, message: EXPORT_NEEDS_REBUILD };
    if (outcome.kind === "refused") return failure(outcome.status, outcome.body);
    return { ok: true, message: outcome.message };
  } catch {
    return { ok: false, message: "GRIDGO could not prepare that file. Check your connection and try again." };
  }
}
