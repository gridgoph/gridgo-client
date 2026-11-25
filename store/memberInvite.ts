import { create } from "zustand";

import { onAccountChange, ownedReads } from "@/lib/ownedReads";
import { memberErrorMessage, refusal } from "@/lib/organizationMembers";
import * as members from "@/lib/organizationMembersApi";
import type { MemberInvite, MemberListEntries, MemberListEntry } from "@/lib/organizationMembersApi";
import type { ReadStatus } from "@/store/organizationMembers";

/**
 * The term's join link, and the people on the member list who have not
 * answered yet (gridgo-client#474). Contacts stay in memory only.
 */

export type InviteNotice = { tone: "success" | "error" | "info"; message: string };

type State = {
  invite: MemberInvite | null;
  status: ReadStatus;
  error: string | null;
  replacing: boolean;
  notice: InviteNotice | null;

  entries: MemberListEntry[];
  entryCounts: MemberListEntries["counts"] | null;
  entriesNext: string | null;
  entriesStatus: ReadStatus;
  entriesError: string | null;
  loadingMore: boolean;
  removing: string | null;
  removeError: string | null;

  load: () => Promise<void>;
  replace: () => Promise<boolean>;
  setNotice: (notice: InviteNotice | null) => void;
  loadEntries: () => Promise<void>;
  moreEntries: () => Promise<void>;
  removeEntry: (entry: MemberListEntry) => Promise<boolean>;
  reset: () => void;
};

const empty = () => ({
  invite: null,
  status: "idle" as ReadStatus,
  error: null,
  replacing: false,
  notice: null,
  entries: [] as MemberListEntry[],
  entryCounts: null,
  entriesNext: null,
  entriesStatus: "idle" as ReadStatus,
  entriesError: null,
  loadingMore: false,
  removing: null,
  removeError: null,
});

const reads = ownedReads();
const INVITE_FAILED = "GRIDGO could not read your invite link. Check your connection and try again.";
const ENTRIES_FAILED = "GRIDGO could not read your member list. Check your connection and try again.";

export const useMemberInvite = create<State>((set, get) => ({
  ...empty(),

  load: async () => {
    set((state) => ({ status: state.status === "ready" ? "ready" : "loading", error: null }));
    // Asking twice keeps one link, so a first visit makes it and later ones read it.
    const result = await reads.run("invite", async () => (await members.getMemberInvite()) ?? members.createMemberInvite());
    if (!result) return;
    if (result.ok) set({ invite: result.value, status: "ready", error: null });
    // An unread link is never handed out: it may have been replaced since.
    else set({ invite: null, status: "failed", error: memberErrorMessage(result.error, INVITE_FAILED) });
  },

  replace: async () => {
    if (get().replacing) return false;
    set({ replacing: true, notice: null });
    const result = await reads.run("invite", () => members.createMemberInvite(true));
    if (!result) return false;
    if (result.ok) {
      set({
        invite: result.value,
        status: "ready",
        error: null,
        replacing: false,
        notice: { tone: "success", message: "New link ready. The old link and QR no longer work." },
      });
      return true;
    }
    set({
      replacing: false,
      notice: { tone: "error", message: memberErrorMessage(result.error, "The link was not changed. Check your connection and try again.") },
    });
    return false;
  },

  setNotice: (notice) => set({ notice }),

  loadEntries: async () => {
    set((state) => ({ entriesStatus: state.entriesStatus === "ready" ? "ready" : "loading" }));
    const result = await reads.run("entries", () => members.getMemberListEntries());
    if (!result) return;
    if (result.ok) {
      set({
        entries: result.value.entries,
        entryCounts: result.value.counts,
        entriesNext: result.value.nextCursor,
        entriesStatus: "ready",
        entriesError: null,
        loadingMore: false,
      });
      return;
    }
    set({ entriesStatus: "failed", entriesError: memberErrorMessage(result.error, ENTRIES_FAILED) });
  },

  moreEntries: async () => {
    const { entriesNext, loadingMore } = get();
    if (!entriesNext || loadingMore) return;
    set({ loadingMore: true });
    const result = await reads.run("entries", () => members.getMemberListEntries(entriesNext));
    if (!result) {
      set({ loadingMore: false });
      return;
    }
    set((state) =>
      result.ok
        ? {
            entries: [...state.entries, ...result.value.entries],
            entryCounts: result.value.counts,
            entriesNext: result.value.nextCursor,
            loadingMore: false,
            entriesError: null,
          }
        : { loadingMore: false, entriesError: memberErrorMessage(result.error, ENTRIES_FAILED) },
    );
  },

  removeEntry: async (entry) => {
    if (get().removing) return false;
    set({ removing: entry.id, removeError: null });
    const result = await reads.run("remove-entry", () => members.removeMemberListEntry(entry.id));
    if (!result) return false;
    const gone = result.ok || refusal(result.error) === "member_list_entry_not_found";
    set((state) => ({
      removing: null,
      entries: gone ? state.entries.filter((row) => row.id !== entry.id) : state.entries,
      removeError: result.ok ? null : memberErrorMessage(result.error, "That was not taken off. Check your connection and try again."),
    }));
    if (gone) void get().loadEntries();
    return result.ok;
  },

  reset: () => {
    reads.cancel();
    set(empty());
  },
}));

onAccountChange(() => useMemberInvite.getState().reset());
