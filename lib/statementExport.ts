/**
 * Keeping an organization statement as a PDF or CSV (gridgo-client#160).
 *
 * The export is a signed-in GET, so it cannot be opened as a plain link: the
 * bytes are fetched with the session's bearer and then handed to whatever the
 * platform uses to keep a file. No new library: the web downloads a blob,
 * iOS offers the share sheet (React Native's `Share` takes a file URL there),
 * and Android asks for a folder through the Storage Access Framework that
 * `expo-file-system` already carries.
 */

import { Platform, Share } from "react-native";

import * as api from "@/lib/api";
import type { StatementPeriod } from "@/lib/api";
import { getFileSystemLegacyNative } from "@/lib/nativeModules";
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

function failure(status: number, body: unknown): ExportResult {
  let code: string | null = null;
  if (typeof body === "string") {
    try {
      const parsed = JSON.parse(body) as { error?: unknown };
      code = typeof parsed.error === "string" ? parsed.error : null;
    } catch {
      code = null;
    }
  }
  return {
    ok: false,
    message:
      organizationErrorMessage(code) ??
      (status === 401
        ? "Your session expired. Sign in again, then export."
        : "GRIDGO could not prepare that file. Try again in a moment."),
  };
}

async function exportOnWeb(url: string, headers: Record<string, string>, name: string): Promise<ExportResult> {
  const response = await fetch(url, { headers });
  if (!response.ok) return failure(response.status, await response.text());
  const blob = await response.blob();
  const href = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = href;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(href), 10_000);
  return { ok: true, message: `Downloaded ${name}.` };
}

export async function exportStatement(
  period: StatementPeriod,
  range: { from: string; to: string },
  format: ExportFormat,
): Promise<ExportResult> {
  const name = statementFileName(range, format);
  try {
    const { url, headers } = await api.statementExportRequest(period, format);
    if (Platform.OS === "web") return await exportOnWeb(url, headers, name);

    const FileSystem = getFileSystemLegacyNative();
    if (!FileSystem?.cacheDirectory) return { ok: false, message: EXPORT_NEEDS_REBUILD };
    const local = `${FileSystem.cacheDirectory}${name}`;
    const downloaded = await FileSystem.downloadAsync(url, local, { headers });
    if (downloaded.status !== 200) {
      const body = await FileSystem.readAsStringAsync(downloaded.uri).catch(() => "");
      return failure(downloaded.status, body);
    }

    if (Platform.OS === "android") {
      const saf = FileSystem.StorageAccessFramework;
      const permission = await saf.requestDirectoryPermissionsAsync();
      if (!permission.granted) return { ok: true, message: null };
      const target = await saf.createFileAsync(permission.directoryUri, name.replace(/\.(pdf|csv)$/, ""), MIME[format]);
      const bytes = await FileSystem.readAsStringAsync(downloaded.uri, { encoding: FileSystem.EncodingType.Base64 });
      await FileSystem.writeAsStringAsync(target, bytes, { encoding: FileSystem.EncodingType.Base64 });
      return { ok: true, message: `Saved ${name}.` };
    }

    await Share.share({ url: downloaded.uri, title: name });
    return { ok: true, message: null };
  } catch {
    return { ok: false, message: "GRIDGO could not prepare that file. Check your connection and try again." };
  }
}
