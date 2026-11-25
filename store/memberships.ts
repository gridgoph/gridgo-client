import { create } from "zustand";

import { ApiError } from "@/lib/api";
import {
  confirmMembershipMatch,
  dismissMembershipMatch,
  endMembership,
  listMemberships,
  matchMemberships,
  previewMembershipInvite,
  requestMembership,
  type JoinSource,
  type Membership,
  type MembershipInvite,
  type MembershipList,
  type MembershipMatch,
} from "@/lib/membershipsApi";
import { userFacingError } from "@/lib/copy";
import { memberErrorMessage } from "@/lib/memberships";
import { apiErrorCode } from "@/lib/whoPrints";
import { useSession } from "@/store/session";

/**
 * My organizations, as GRIDGO last answered (gridgo-client#475). Never
 * persisted: an officer can end a membership at any moment, and the uses left
 * are live. Tied to the account that read it, so a phone handed to somebody
 * else never shows the previous person's orgs.
 */
export type InviteRead =
  | { status: "loading" }
  | { status: "ready"; invite: MembershipInvite }
  | { status: "closed"; message: string }
  | { status: "failed"; message: string };

type MembershipsState = {
  ownerId: string | null;
  memberships: Membership[] | null;
  matches: MembershipMatch[];
  loading: boolean;
  /** The first read failed; nothing is on screen to keep. */
  error: string | null;
  /** GRIDGO without memberships: nothing is offered. */
  unavailable: boolean;
  /** The match or membership an action is running on, or `join`. */
  busyId: string | null;
  /** What that action answered, beside it. */
  actionError: { id: string; message: string } | null;
  /** Just confirmed on Home, until the client moves on. */
  confirmed: Membership | null;
  invite: (InviteRead & { token: string }) | null;
  load: () => Promise<void>;
  /** Matching asks the identity provider, so it runs on sign-in and on resume only. */
  match: () => Promise<void>;
  confirm: (matchId: string) => Promise<Membership | null>;
  dismiss: (matchId: string) => Promise<boolean>;
  readInvite: (token: string) => Promise<void>;
  join: (token: string, source: JoinSource) => Promise<Membership | null>;
  end: (membershipId: string) => Promise<boolean>;
  clearConfirmed: () => void;
  clearActionError: () => void;
  reset: () => void;
};

/** GRIDGO allows 30 matches in ten minutes; a resume is not a reason to spend them. */
export const MATCH_GAP_MS = 60_000;

const EMPTY = {
  ownerId: null,
  memberships: null,
  matches: [] as MembershipMatch[],
  loading: false,
  error: null,
  unavailable: false,
  busyId: null,
  actionError: null,
  confirmed: null,
  invite: null,
};

let sequence = 0;
let matchedAt = 0;
/** The match in flight: a plain read would answer from before it. */
let matching: Promise<void> | null = null;

/** A member is a person: an organization account has members instead. */
export function canJoinOrgs(user: { accountType?: string | null } | null | undefined): boolean {
  return Boolean(user) && user?.accountType !== "organization";
}

export const useMemberships = create<MembershipsState>()((set, get) => {
  const owner = () => {
    const user = useSession.getState().user;
    return user && canJoinOrgs(user) ? user.id : null;
  };
  const adopt = (list: MembershipList) =>
    set({
      memberships: Array.isArray(list.memberships) ? list.memberships : [],
      matches: Array.isArray(list.matches) ? list.matches : [],
      loading: false,
      error: null,
      unavailable: false,
    });
  /** One changed membership, put back in its place (or added). */
  const put = (membership: Membership) =>
    set((state) => {
      const held = state.memberships ?? [];
      const known = held.some((entry) => entry.id === membership.id);
      return {
        memberships: known
          ? held.map((entry) => (entry.id === membership.id ? membership : entry))
          : [membership, ...held],
      };
    });

  const read = async (call: () => Promise<MembershipList>) => {
    const ownerId = owner();
    if (!ownerId) return false;
    const mine = ++sequence;
    set((state) => ({
      ...(state.ownerId !== ownerId ? { ...EMPTY, ownerId } : {}),
      loading: true,
    }));
    const current = () => mine === sequence && owner() === ownerId;
    try {
      const list = await call();
      if (current()) adopt(list);
      return true;
    } catch (error) {
      if (!current()) return true;
      // An API from before memberships is not a failure to show anyone.
      const unavailable = error instanceof ApiError && (error.status === 404 || error.status === 405);
      set((state) => ({
        loading: false,
        unavailable: unavailable || state.unavailable,
        error: unavailable
          ? null
          : memberErrorMessage(error, userFacingError(error, "GRIDGO could not load your orgs. Try again.")),
      }));
      return false;
    }
  };

  /** One action at a time; its answer is dropped if the account changed meanwhile. */
  const act = async <T,>(id: string, fallback: string, call: () => Promise<T>): Promise<T | null> => {
    const ownerId = owner();
    if (!ownerId || get().busyId) return null;
    set({ busyId: id, actionError: null });
    try {
      const result = await call();
      if (owner() !== ownerId) return null;
      return result;
    } catch (error) {
      if (owner() === ownerId) {
        set({ actionError: { id, message: memberErrorMessage(error, userFacingError(error, fallback)) } });
      }
      return null;
    } finally {
      if (get().busyId === id) set({ busyId: null });
    }
  };

  return {
    ...EMPTY,

    load: async () => {
      if (matching) await matching;
      else await read(listMemberships);
    },

    match: async () => {
      const ownerId = owner();
      if (!ownerId) return;
      if (get().ownerId === ownerId && Date.now() - matchedAt < MATCH_GAP_MS) return;
      matchedAt = Date.now();
      const run = (async () => {
        // Matching can fail on its own; the orgs already held are still read.
        if (!(await read(matchMemberships)) && !get().unavailable) await read(listMemberships);
      })();
      matching = run;
      await run;
      if (matching === run) matching = null;
    },

    confirm: async (matchId) => {
      const membership = await act(matchId, "That did not go through. Try again.", () =>
        confirmMembershipMatch(matchId),
      );
      // A closed invitation stays on screen with its reason until the next read.
      if (!membership) return null;
      put(membership);
      set((state) => ({
        matches: state.matches.filter((entry) => entry.id !== matchId),
        confirmed: membership,
      }));
      return membership;
    },

    dismiss: async (matchId) => {
      const list = await act(matchId, "That did not go through. Try again.", () => dismissMembershipMatch(matchId));
      if (!list) return false;
      sequence++;
      adopt(list);
      return true;
    },

    readInvite: async (token) => {
      const ownerId = owner();
      set({ invite: { token, status: "loading" } });
      const answer = (next: InviteRead) => {
        if (get().invite?.token === token && owner() === ownerId) set({ invite: { token, ...next } });
      };
      try {
        answer({ status: "ready", invite: await previewMembershipInvite(token) });
      } catch (error) {
        const message = memberErrorMessage(error, userFacingError(error, "GRIDGO could not open this link. Try again."));
        // Asking again about a link that does not work only spends a look-up.
        const closed = ["member_invite_not_found", "member_join_rate_limited"].includes(apiErrorCode(error) ?? "");
        answer({ status: closed ? "closed" : "failed", message });
      }
    },

    join: async (token, source) => {
      const membership = await act("join", "Your request was not sent. Try again.", () =>
        requestMembership(token, source),
      );
      if (membership) put(membership);
      return membership;
    },

    end: async (membershipId) => {
      const membership = await act(membershipId, "That did not go through. Try again.", () =>
        endMembership(membershipId),
      );
      if (!membership) return false;
      put(membership);
      return true;
    },

    clearConfirmed: () => set({ confirmed: null }),
    clearActionError: () => set({ actionError: null }),

    reset: () => {
      sequence++;
      matchedAt = 0;
      matching = null;
      set({ ...EMPTY });
    },
  };
});

/** My orgs, only while they belong to whoever is signed in now. */
export function useOwnMemberships(): Membership[] | null {
  const userId = useSession((s) => s.user?.id ?? null);
  return useMemberships((s) => (userId && s.ownerId === userId ? s.memberships : null));
}

const NO_MATCHES: MembershipMatch[] = [];

export function useOwnMatches(): MembershipMatch[] {
  const userId = useSession((s) => s.user?.id ?? null);
  return useMemberships((s) => (userId && s.ownerId === userId ? s.matches : NO_MATCHES));
}

// A different account, or nobody, signed in: drop the last person's orgs.
useSession.subscribe((state, previous) => {
  if (state.user?.id !== previous.user?.id) useMemberships.getState().reset();
});
