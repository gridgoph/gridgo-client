import { create } from "zustand";

import { onAccountChange, ownedReads } from "@/lib/ownedReads";
import { fixMessage, memberErrorMessage, type ListTotals } from "@/lib/organizationMembers";
import * as members from "@/lib/organizationMembersApi";
import type { MemberListRow } from "@/lib/organizationMembersApi";
import { LIST_ROW_LIMIT } from "@/lib/memberListCsv";
import { useMemberInvite } from "@/store/memberInvite";

/**
 * A member list on its way to GRIDGO: chosen, checked, fixed, saved
 * (gridgo-client#474).
 *
 * In memory only, never on the phone's storage: it is other people's contact
 * details. GRIDGO decides which rows are good. A row fixed here is checked on
 * its own, because every row checked counts toward the day's limit.
 */

export type DraftFix = { key: string; message: string };
/** `typed` rows were added by hand, so choosing another file keeps them. */
export type DraftRow = MemberListRow & { key: string; typed?: boolean };

export type DraftStep = "choose" | "checked" | "saved";

type State = {
  step: DraftStep;
  fileName: string | null;
  rows: DraftRow[];
  consent: boolean;
  fixes: DraftFix[];
  totals: ListTotals;
  checking: boolean;
  saving: boolean;
  /** Rows GRIDGO stored. */
  savedCount: number;
  savedEmailCount: number;
  /** Why the chosen file was not used; said beside choosing one. */
  fileError: string | null;
  /** Why a check or save did not land; said beside those. */
  error: string | null;
  fixing: string | null;
  fixError: string | null;

  choose: (fileName: string, rows: MemberListRow[]) => void;
  add: (row: MemberListRow) => boolean;
  update: (key: string, row: MemberListRow) => void;
  drop: (key: string) => void;
  setConsent: (consent: boolean) => void;
  setFileError: (fileError: string | null) => void;
  check: () => Promise<boolean>;
  fix: (key: string, row: MemberListRow) => Promise<boolean>;
  save: () => Promise<boolean>;
  backToChoose: () => void;
  /** After saving: carry on with the rows that were left out. */
  fixRest: () => void;
  reset: () => void;
};

const NO_TOTALS: ListTotals = { readyCount: 0, emailCount: 0, mobileCount: 0, alreadyListedCount: 0 };

const empty = () => ({
  step: "choose" as DraftStep,
  fileName: null,
  rows: [] as DraftRow[],
  consent: false,
  fixes: [] as DraftFix[],
  totals: NO_TOTALS,
  checking: false,
  saving: false,
  savedCount: 0,
  savedEmailCount: 0,
  fileError: null,
  error: null,
  fixing: null,
  fixError: null,
});

const reads = ownedReads();
let nextKey = 0;
const keyed = (row: MemberListRow): DraftRow => ({ ...row, key: `row-${++nextKey}` });
const plain = ({ name, contact, memberSince }: MemberListRow): MemberListRow => ({ name, contact, memberSince });

const CHECK_FAILED = "GRIDGO could not check the list. Nothing was saved. Check your connection and try again.";
const SAVE_FAILED = "GRIDGO could not confirm the list was saved. Check your connection and try again. Nobody is added twice.";

/** The rows that passed: what a save sends. */
export function readyRows(state: Pick<State, "rows" | "fixes">): DraftRow[] {
  const broken = new Set(state.fixes.map((fix) => fix.key));
  return state.rows.filter((row) => !broken.has(row.key));
}

export const useMemberListDraft = create<State>((set, get) => ({
  ...empty(),

  choose: (fileName, rows) =>
    set((state) => {
      const typed = state.rows.filter((row) => row.typed);
      if (typed.length + rows.length > LIST_ROW_LIMIT) {
        return { fileError: `That would be more than ${LIST_ROW_LIMIT} people. Send this list first, then the file.` };
      }
      // Different people, so the consent is asked again.
      return { ...empty(), fileName, rows: [...typed, ...rows.map(keyed)] };
    }),

  add: (row) => {
    if (get().rows.length >= LIST_ROW_LIMIT) return false;
    set((state) => ({ rows: [...state.rows, { ...keyed(row), typed: true }], error: null }));
    return true;
  },

  update: (key, row) =>
    set((state) => ({ rows: state.rows.map((entry) => (entry.key === key ? { ...entry, ...plain(row) } : entry)), error: null })),

  drop: (key) =>
    set((state) => ({
      rows: state.rows.filter((row) => row.key !== key),
      fixes: state.fixes.filter((fix) => fix.key !== key),
      error: null,
    })),

  setConsent: (consent) => set({ consent, error: null }),
  setFileError: (fileError) => set({ fileError }),

  check: async () => {
    const { rows, checking } = get();
    if (checking || !rows.length) return false;
    set({ checking: true, error: null });
    const result = await reads.run("check", () => members.checkMemberList(rows.map(plain)));
    if (!result) return false;
    if (!result.ok) {
      set({ checking: false, error: memberErrorMessage(result.error, CHECK_FAILED) });
      return false;
    }
    const check = result.value;
    set({
      checking: false,
      step: "checked",
      totals: check,
      fixes: check.needsFix.flatMap((fix) => {
        const row = rows[fix.row - 1];
        return row ? [{ key: row.key, message: fixMessage(fix.code, fix.message) }] : [];
      }),
    });
    return true;
  },

  fix: async (key, row) => {
    if (get().fixing) return false;
    set({ fixing: key, fixError: null });
    const contact = row.contact.trim().toLowerCase();
    if (contact && readyRows(get()).some((entry) => entry.key !== key && entry.contact.trim().toLowerCase() === contact)) {
      set({ fixing: null, fixError: "Somebody else on this list has the same contact." });
      return false;
    }
    const result = await reads.run("fix", () => members.checkMemberList([plain(row)]));
    if (!result) return false;
    if (!result.ok) {
      set({ fixing: null, fixError: memberErrorMessage(result.error, CHECK_FAILED) });
      return false;
    }
    const check = result.value;
    const problem = check.needsFix[0];
    get().update(key, row);
    if (problem) {
      set((state) => ({
        fixing: null,
        fixError: problem.message,
        fixes: state.fixes.map((fix) => (fix.key === key ? { key, message: fixMessage(problem.code, problem.message) } : fix)),
      }));
      return false;
    }
    set((state) => ({
      fixing: null,
      fixes: state.fixes.filter((fix) => fix.key !== key),
      totals: {
        readyCount: state.totals.readyCount + check.readyCount,
        emailCount: state.totals.emailCount + check.emailCount,
        mobileCount: state.totals.mobileCount + check.mobileCount,
        alreadyListedCount: state.totals.alreadyListedCount + check.alreadyListedCount,
      },
    }));
    return true;
  },

  save: async () => {
    const state = get();
    const ready = readyRows(state);
    if (state.saving || !ready.length || !state.consent) return false;
    set({ saving: true, error: null });
    const result = await reads.run("save", () => members.saveMemberList(ready.map(plain)));
    if (!result) return false;
    if (!result.ok) {
      set({ saving: false, error: memberErrorMessage(result.error, SAVE_FAILED) });
      return false;
    }
    const saved = result.value;
    // GRIDGO checks again as it saves; a row it refused then is kept to fix.
    const refused = saved.needsFix.flatMap((fix) => {
      const row = ready[fix.row - 1];
      return row ? [{ key: row.key, message: fixMessage(fix.code, fix.message) }] : [];
    });
    const left = [...get().fixes, ...refused];
    const keep = new Set(left.map((fix) => fix.key));
    set((current) => ({
      saving: false,
      step: "saved",
      savedCount: saved.savedCount,
      savedEmailCount: saved.emailCount,
      fixes: left,
      rows: current.rows.filter((row) => keep.has(row.key)),
      totals: NO_TOTALS,
    }));
    void useMemberInvite.getState().loadEntries();
    return true;
  },

  backToChoose: () => set({ step: "choose", fixes: [], totals: NO_TOTALS, error: null }),
  fixRest: () => set({ step: "checked", error: null }),

  reset: () => {
    reads.cancel();
    set(empty());
  },
}));

onAccountChange(() => useMemberListDraft.getState().reset());
