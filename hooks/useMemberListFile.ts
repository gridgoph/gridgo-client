import { useCallback, useState } from "react";

import { FILE_PICKER_NEEDS_REBUILD, getDocumentPickerNative } from "@/lib/nativeModules";
import { LIST_FILE_LIMIT, LIST_FILE_PROBLEM, parseMemberList } from "@/lib/memberListCsv";
import { readTextFile } from "@/lib/readTextFile";
import { useMemberListDraft } from "@/store/memberListDraft";

/** Android reports a CSV under several names, so the picker takes plain text and the table programs' own type too. */
const CSV_TYPES = ["text/csv", "text/comma-separated-values", "application/csv", "application/vnd.ms-excel", "text/plain", ".csv"];

const LETTERS_PROBLEM =
  "Some letters in that file could not be read. Save it again as \"CSV UTF-8\", then choose it.";

/** Choosing a CSV: reads it on the phone and puts its rows in the draft. */
export function useMemberListFile(): { choose: () => Promise<void>; reading: boolean } {
  const [reading, setReading] = useState(false);

  const choose = useCallback(async () => {
    const draft = useMemberListDraft.getState();
    const picker = getDocumentPickerNative();
    if (!picker) {
      draft.setFileError(FILE_PICKER_NEEDS_REBUILD);
      return;
    }
    draft.setFileError(null);
    setReading(true);
    try {
      const picked = await picker.getDocumentAsync({ type: CSV_TYPES, copyToCacheDirectory: true });
      const asset = picked.canceled ? null : picked.assets[0];
      if (!asset) return;
      if ((asset.size ?? 0) > LIST_FILE_LIMIT) {
        draft.setFileError("That file is too large. Split it and send each part.");
        return;
      }
      const text = await readTextFile(asset.uri, asset.file ?? null);
      if (text.includes("�")) {
        draft.setFileError(LETTERS_PROBLEM);
        return;
      }
      const parsed = parseMemberList(text);
      if (parsed.ok) draft.choose(asset.name, parsed.rows);
      else draft.setFileError(parsed.problem);
    } catch {
      draft.setFileError(LIST_FILE_PROBLEM);
    } finally {
      setReading(false);
    }
  }, []);

  return { choose, reading };
}
