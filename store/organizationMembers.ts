import { create } from "zustand";

import { onAccountChange, ownedReads } from "@/lib/ownedReads";
import { isNotPartner, isStaleMember, memberErrorMessage, RENEW_LIMIT } from "@/lib/organizationMembers";
import * as members from "@/lib/organizationMembersApi";
import type {
  MemberFilter,
  MemberRequest,
  MembersSummary,
  OrganizationMember,
  Partnership,
} from "@/lib/organizationMembersApi";
import { useSession } from "@/store/session";

/**
 * The officer's members, requests and partnership (gridgo-client#474).
 *
 * Nothing is kept on the phone: a member list is other people's data, and the
 * API's answer is the only one worth showing. A failed refresh keeps what was
 * on screen and says it is not fresh.
 */

export type ReadStatus = "idle" | "loading" | "ready" | "failed";

/** `unknown` until GRIDGO answers; `none` hides every member screen's door. */
export type PartnerState = "unknown" | "live" | "none";

type Page<T> = { rows: T[]; total: number; nextCursor: string | null; status: ReadStatus; error: string | null; loadingMore: boolean };

const emptyPage = <T>(): Page<T> => ({ rows: [], total: 0, nextCursor: null, status: "idle", error: null, loadingMore: false });

export type FilterCounts = Record<MemberFilter, number>;

type State = {
  partner: PartnerState;
  summary: MembersSummary | null;
  summaryStatus: ReadStatus;
  summaryError: string | null;
  partnership: Partnership | null;
  partnershipStatus: ReadStatus;
  partnershipError: string | null;
  requests: Page<MemberRequest>;
  list: Page<OrganizationMember>;
  query: string;
  filter: MemberFilter;
  counts: FilterCounts | null;
  member: OrganizationMember | null;
  memberStatus: ReadStatus;
  memberError: string | null;
  expired: Page<OrganizationMember>;
  selected: string[];
  /** Which action is in flight, named by what it acts on. */
  acting: string | null;
  actionError: string | null;
  /** The last thing that landed, said where the officer ends up. */
  notice: string | null;

  loadSummary: () => Promise<void>;
  loadPartnership: () => Promise<void>;
  loadRequests: () => Promise<void>;
  moreRequests: () => Promise<void>;
  loadMembers: () => Promise<void>;
  moreMembers: () => Promise<void>;
  loadCounts: () => Promise<void>;
  setQuery: (query: string) => void;
  setFilter: (filter: MemberFilter) => void;
  openMember: (id: string) => Promise<void>;
  approve: (request: MemberRequest, memberSince: string, term: string) => Promise<boolean>;
  decline: (request: MemberRequest) => Promise<boolean>;
  editSince: (member: OrganizationMember, memberSince: string) => Promise<boolean>;
  remove: (member: OrganizationMember) => Promise<boolean>;
  renewOne: (member: OrganizationMember) => Promise<boolean>;
  loadExpired: () => Promise<void>;
  moreExpired: () => Promise<void>;
  toggleSelected: (id: string) => void;
  selectAll: () => void;
  clearSelected: () => void;
  renewSelected: () => Promise<boolean>;
  clearAction: () => void;
  clearNotice: () => void;
  reset: () => void;
};

const empty = () => ({
  partner: "unknown" as PartnerState,
  summary: null,
  summaryStatus: "idle" as ReadStatus,
  summaryError: null,
  partnership: null,
  partnershipStatus: "idle" as ReadStatus,
  partnershipError: null,
  requests: emptyPage<MemberRequest>(),
  list: emptyPage<OrganizationMember>(),
  query: "",
  filter: "all" as MemberFilter,
  counts: null,
  member: null,
  memberStatus: "idle" as ReadStatus,
  memberError: null,
  expired: emptyPage<OrganizationMember>(),
  selected: [] as string[],
  acting: null,
  actionError: null,
  notice: null,
});

const reads = ownedReads();

const READ_FAILED = "GRIDGO could not read your members. Check your connection and try again.";
const ACTION_FAILED = "GRIDGO could not save that. Check your connection and try again.";

/** Names repeat across pages only when the list moved underneath; keep the newest copy. */
function join<T extends { id: string }>(before: T[], after: T[]): T[] {
  const ids = new Set(after.map((row) => row.id));
  return [...before.filter((row) => !ids.has(row.id)), ...after];
}

export const useOrganizationMembers = create<State>((set, get) => {
  /** One refusal answers for every screen: this account is not a live partner. */
  const notPartner = (error: unknown) => {
    if (isNotPartner(error)) set({ partner: "none", summary: null, partnership: null });
  };

  const act = async (key: string, run: () => Promise<void>): Promise<boolean> => {
    if (get().acting) return false;
    const ownerId = useSession.getState().user?.id ?? null;
    if (!ownerId) return false;
    set({ acting: key, actionError: null, notice: null });
    try {
      await run();
      if (useSession.getState().user?.id !== ownerId) return false;
      set({ acting: null });
      return true;
    } catch (error) {
      if (useSession.getState().user?.id !== ownerId) return false;
      set({ acting: null, actionError: memberErrorMessage(error, ACTION_FAILED) });
      notPartner(error);
      if (isStaleMember(error)) {
        void get().loadRequests();
        void get().loadSummary();
        const open = get().member;
        if (open) void get().openMember(open.id);
        if (get().expired.status !== "idle") void get().loadExpired();
      }
      return false;
    }
  };

  const refresh = () => {
    void get().loadSummary();
    void get().loadMembers();
    void get().loadCounts();
    if (get().partnershipStatus !== "idle") void get().loadPartnership();
  };

  const replaceMember = (member: OrganizationMember) =>
    set((state) => ({
      member,
      memberStatus: "ready",
      memberError: null,
      list: { ...state.list, rows: state.list.rows.map((row) => (row.id === member.id ? member : row)) },
    }));

  return {
    ...empty(),

    loadSummary: async () => {
      set((state) => ({ summaryStatus: state.summaryStatus === "ready" ? "ready" : "loading" }));
      const result = await reads.run("summary", members.getMembersSummary);
      if (!result) return;
      if (result.ok) {
        set({ summary: result.value, summaryStatus: "ready", summaryError: null, partner: "live" });
        return;
      }
      set({ summaryStatus: "failed", summaryError: memberErrorMessage(result.error, READ_FAILED) });
      notPartner(result.error);
    },

    loadPartnership: async () => {
      set((state) => ({ partnershipStatus: state.partnershipStatus === "ready" ? "ready" : "loading" }));
      const result = await reads.run("partnership", members.getPartnership);
      if (!result) return;
      if (result.ok) {
        set({ partnership: result.value, partnershipStatus: "ready", partnershipError: null, partner: "live" });
        return;
      }
      set({
        partnershipStatus: "failed",
        partnershipError: memberErrorMessage(result.error, "GRIDGO could not read your partnership. Check your connection and try again."),
      });
      notPartner(result.error);
    },

    loadRequests: async () => {
      set((state) => ({ requests: { ...state.requests, status: state.requests.status === "ready" ? "ready" : "loading" } }));
      const result = await reads.run("requests", () => members.listMemberRequests());
      if (!result) return;
      if (result.ok) {
        const { requests, total, nextCursor } = result.value;
        set({ requests: { rows: requests, total, nextCursor, status: "ready", error: null, loadingMore: false } });
        return;
      }
      set((state) => ({ requests: { ...state.requests, status: "failed", error: memberErrorMessage(result.error, READ_FAILED) } }));
      notPartner(result.error);
    },

    moreRequests: async () => {
      const { nextCursor, loadingMore } = get().requests;
      if (!nextCursor || loadingMore) return;
      set((state) => ({ requests: { ...state.requests, loadingMore: true } }));
      const result = await reads.run("requests", () => members.listMemberRequests(nextCursor));
      if (!result) {
        set((state) => ({ requests: { ...state.requests, loadingMore: false } }));
        return;
      }
      set((state) => ({
        requests: result.ok
          ? {
              rows: join(state.requests.rows, result.value.requests),
              total: result.value.total,
              nextCursor: result.value.nextCursor,
              status: "ready",
              error: null,
              loadingMore: false,
            }
          : { ...state.requests, loadingMore: false, error: memberErrorMessage(result.error, READ_FAILED) },
      }));
    },

    loadMembers: async () => {
      const { query, filter } = get();
      set((state) => ({ list: { ...state.list, status: state.list.status === "ready" ? "ready" : "loading" } }));
      const result = await reads.run("members", () => members.listMembers({ q: query, filter, status: "active" }));
      if (!result) return;
      if (result.ok) {
        const { members: rows, total, nextCursor } = result.value;
        set({ list: { rows, total, nextCursor, status: "ready", error: null, loadingMore: false } });
        return;
      }
      set((state) => ({ list: { ...state.list, status: "failed", error: memberErrorMessage(result.error, READ_FAILED) } }));
      notPartner(result.error);
    },

    moreMembers: async () => {
      const { query, filter, list } = get();
      if (!list.nextCursor || list.loadingMore) return;
      set({ list: { ...list, loadingMore: true } });
      const result = await reads.run("members", () =>
        members.listMembers({ q: query, filter, status: "active", after: list.nextCursor }),
      );
      if (!result) {
        set((state) => ({ list: { ...state.list, loadingMore: false } }));
        return;
      }
      set((state) => ({
        list: result.ok
          ? {
              rows: join(state.list.rows, result.value.members),
              total: result.value.total,
              nextCursor: result.value.nextCursor,
              status: "ready",
              error: null,
              loadingMore: false,
            }
          : { ...state.list, loadingMore: false, error: memberErrorMessage(result.error, READ_FAILED) },
      }));
    },

    /** The filter's own totals, so each chip says how many it holds before the tap. */
    loadCounts: async () => {
      const result = await reads.run("counts", async () => {
        const [all, ordered, notOrdered] = await Promise.all(
          (["all", "ordered", "not_ordered"] as const).map((filter) => members.listMembers({ filter, status: "active", limit: 1 })),
        );
        return { all: all!.total, ordered: ordered!.total, not_ordered: notOrdered!.total };
      });
      if (result?.ok) set({ counts: result.value });
    },

    setQuery: (query) => set({ query }),

    setFilter: (filter) => {
      if (get().filter === filter) return;
      set({ filter, list: emptyPage<OrganizationMember>() });
      void get().loadMembers();
    },

    openMember: async (id) => {
      const known = get().member?.id === id ? get().member : (get().list.rows.find((row) => row.id === id) ?? null);
      set({ member: known, memberStatus: known ? "ready" : "loading", memberError: null });
      const result = await reads.run("member", () => members.getMember(id));
      if (!result) return;
      if (result.ok) {
        replaceMember(result.value);
        return;
      }
      set((state) => ({
        memberStatus: "failed",
        memberError: memberErrorMessage(result.error, "GRIDGO could not read this member. Check your connection and try again."),
        member: isStaleMember(result.error) ? null : state.member,
      }));
      notPartner(result.error);
    },

    approve: (request, memberSince, term) =>
      act(`approve:${request.id}`, async () => {
        await members.approveMember(request.id, request.version, memberSince, term);
        set((state) => ({
          requests: withoutRow(state.requests, request.id),
          notice: `${request.name} is now a member`,
        }));
        refresh();
      }),

    decline: (request) =>
      act(`decline:${request.id}`, async () => {
        await members.declineMember(request.id, request.version);
        set((state) => ({
          requests: withoutRow(state.requests, request.id),
          notice: `Request from ${request.name} declined`,
        }));
        refresh();
      }),

    editSince: (member, memberSince) =>
      act(`edit:${member.id}`, async () => {
        replaceMember(await members.editMemberSince(member.id, member.version, memberSince));
        set({ notice: "Date updated" });
      }),

    remove: (member) =>
      act(`remove:${member.id}`, async () => {
        await members.removeMember(member.id, member.version);
        set((state) => ({
          list: withoutRow(state.list, member.id),
          expired: withoutRow(state.expired, member.id),
          selected: state.selected.filter((id) => id !== member.id),
          member: null,
          notice: `${member.name} is no longer a member`,
        }));
        refresh();
      }),

    renewOne: (member) =>
      act(`renew:${member.id}`, async () => {
        const renewed = await members.renewMember(member.id, member.version);
        replaceMember(renewed);
        set((state) => ({
          expired: withoutRow(state.expired, member.id),
          notice: `${member.name} is renewed for ${renewed.term.label}`,
        }));
        refresh();
      }),

    loadExpired: async () => {
      set((state) => ({ expired: { ...state.expired, status: state.expired.status === "ready" ? "ready" : "loading" } }));
      const result = await reads.run("expired", () => members.listMembers({ status: "expired", limit: 200 }));
      if (!result) return;
      if (result.ok) {
        const { members: rows, total, nextCursor } = result.value;
        const ids = new Set(rows.map((row) => row.id));
        set((state) => ({
          expired: { rows, total, nextCursor, status: "ready", error: null, loadingMore: false },
          // Nobody already renewed elsewhere stays ticked.
          selected: state.selected.filter((id) => ids.has(id)),
        }));
        return;
      }
      set((state) => ({ expired: { ...state.expired, status: "failed", error: memberErrorMessage(result.error, READ_FAILED) } }));
      notPartner(result.error);
    },

    moreExpired: async () => {
      const { nextCursor, loadingMore } = get().expired;
      if (!nextCursor || loadingMore) return;
      set((state) => ({ expired: { ...state.expired, loadingMore: true } }));
      const result = await reads.run("expired", () => members.listMembers({ status: "expired", limit: 200, after: nextCursor }));
      if (!result) {
        set((state) => ({ expired: { ...state.expired, loadingMore: false } }));
        return;
      }
      set((state) => ({
        expired: result.ok
          ? {
              rows: join(state.expired.rows, result.value.members),
              total: result.value.total,
              nextCursor: result.value.nextCursor,
              status: "ready",
              error: null,
              loadingMore: false,
            }
          : { ...state.expired, loadingMore: false, error: memberErrorMessage(result.error, READ_FAILED) },
      }));
    },

    toggleSelected: (id) =>
      set((state) => ({
        actionError: null,
        selected: state.selected.includes(id)
          ? state.selected.filter((entry) => entry !== id)
          : state.selected.length < RENEW_LIMIT
            ? [...state.selected, id]
            : state.selected,
      })),

    selectAll: () => set((state) => ({ actionError: null, selected: state.expired.rows.slice(0, RENEW_LIMIT).map((row) => row.id) })),

    clearSelected: () => set({ selected: [] }),

    renewSelected: () => {
      const ids = get().selected;
      if (!ids.length) return Promise.resolve(false);
      return act("renew", async () => {
        const { renewed, term } = await members.renewMembers(ids);
        const done = new Set(renewed);
        set((state) => ({
          selected: [],
          expired: {
            ...state.expired,
            rows: state.expired.rows.filter((row) => !done.has(row.id)),
            total: Math.max(0, state.expired.total - renewed.length),
          },
          notice: `${renewed.length === 1 ? "1 member" : `${renewed.length.toLocaleString("en-PH")} members`} renewed for ${term.label}`,
        }));
        refresh();
      });
    },

    clearAction: () => set({ actionError: null }),
    clearNotice: () => set({ notice: null }),

    reset: () => {
      reads.cancel();
      set(empty());
    },
  };
});

function withoutRow<T extends { id: string }>(page: Page<T>, id: string): Page<T> {
  const rows = page.rows.filter((row) => row.id !== id);
  return rows.length === page.rows.length ? page : { ...page, rows, total: Math.max(0, page.total - 1) };
}

onAccountChange(() => useOrganizationMembers.getState().reset());
