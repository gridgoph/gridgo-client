import { create } from "zustand";
import { persist } from "zustand/middleware";

import * as api from "@/lib/api";
import { userFacingError } from "@/lib/copy";
import { groupErrorLine } from "@/lib/expressGroup";
import { createPersistStorage } from "@/lib/persistStorage";
import { apiErrorCode } from "@/lib/whoPrints";

/**
 * Whether this GRIDGO offers group orders. Unknown until `GET /me/express-groups`
 * answers; an API from before groups answers 404, and every group entry stays
 * hidden so today's Express flow is all there is.
 */
export type GroupsAvailable = "unknown" | "on" | "off";

export type GroupAction =
  | "create"
  | "join"
  | "files"
  | "leave"
  | "remove"
  | "close"
  | "cancel"
  | "paid_back"
  | "decision";

/** An invite link, read before joining. */
export type InviteRead =
  | { status: "loading"; token: string }
  | { status: "ready"; token: string; invite: api.ExpressGroupInvite }
  /** Already a member: the screen goes straight to the group. */
  | { status: "member"; token: string; groupId: string }
  | { status: "closed"; token: string; message: string }
  | { status: "error"; token: string; message: string };

type GroupState = {
  available: GroupsAvailable;
  /** The caller's own groups, newest answer from GRIDGO. */
  mine: api.ExpressGroup[] | null;
  byId: Record<string, api.ExpressGroup>;
  tracking: Record<string, api.ExpressGroupTracking>;
  /**
   * Invite tokens by group. GRIDGO returns a token once, at create, and keeps
   * only its digest, so the host's phone holds it to share again later. It
   * expires with the group.
   */
  tokens: Record<string, string>;
  /** Group ids whose last read failed, with what to say. */
  loadError: Record<string, string>;
  /** Groups this person is no longer in (left, removed, or gone), with what to say. */
  gone: Record<string, string>;
  busy: GroupAction | null;
  error: string | null;
  invite: InviteRead | null;

  readInvite: (token: string) => Promise<void>;
  loadMine: () => Promise<void>;
  load: (id: string) => Promise<api.ExpressGroup | null>;
  loadTracking: (id: string) => Promise<void>;
  create: (setup: api.ExpressGroupSetup) => Promise<api.ExpressGroup | null>;
  join: (token: string) => Promise<api.ExpressGroup | null>;
  saveFiles: (id: string, files: api.ExpressGroupFile[]) => Promise<boolean>;
  leave: (id: string) => Promise<boolean>;
  remove: (id: string, userId: string) => Promise<boolean>;
  close: (id: string) => Promise<boolean>;
  cancel: (id: string) => Promise<boolean>;
  setPaidBack: (id: string, userId: string, paidBack: boolean) => Promise<boolean>;
  decide: (id: string, decision: "use" | "cancel") => Promise<boolean>;
  adopt: (group: api.ExpressGroup) => void;
  clearError: () => void;
  reset: () => void;
};

/** A route an API from before group orders does not have. */
function groupsMissing(error: unknown): boolean {
  return error instanceof api.ApiError && [404, 405].includes(error.status) && apiErrorCode(error) !== "group_not_found";
}

export function groupError(error: unknown, fallback: string): string {
  return groupErrorLine(apiErrorCode(error)) ?? userFacingError(error, fallback);
}

export const useExpressGroup = create<GroupState>()(
  persist(
    (set, get) => {
      const put = (group: api.ExpressGroup) => {
        const mine = get().mine;
        set({
          byId: { ...get().byId, [group.id]: group },
          mine: mine ? [group, ...mine.filter((row) => row.id !== group.id)] : [group],
          available: "on",
        });
      };

      /** Runs one action with its busy flag and plain-words error. */
      const run = async <T>(action: GroupAction, fallback: string, work: () => Promise<T>): Promise<T | null> => {
        if (get().busy) return null;
        set({ busy: action, error: null });
        try {
          return await work();
        } catch (error) {
          set({ error: groupError(error, fallback) });
          return null;
        } finally {
          set({ busy: null });
        }
      };

      const drop = (id: string) => {
        const { [id]: _gone, ...byId } = get().byId;
        const { [id]: _token, ...tokens } = get().tokens;
        set({ byId, tokens, mine: (get().mine ?? []).filter((row) => row.id !== id) });
      };

      return {
        available: "unknown",
        mine: null,
        byId: {},
        tracking: {},
        tokens: {},
        loadError: {},
        gone: {},
        busy: null,
        error: null,
        invite: null,

        adopt: put,

        readInvite: async (token) => {
          set({ invite: { status: "loading", token }, error: null });
          try {
            const invite = await api.getExpressGroupInvite(token);
            const mine = get().mine ?? (await api.listMyExpressGroups().catch(() => [] as api.ExpressGroup[]));
            if (get().invite?.token !== token) return;
            set({
              invite: mine.some((group) => group.id === invite.id)
                ? { status: "member", token, groupId: invite.id }
                : { status: "ready", token, invite },
            });
          } catch (error) {
            if (get().invite?.token !== token) return;
            const code = apiErrorCode(error);
            const closed = code === "group_closed" || code === "group_full" || code === "group_not_found";
            set({
              invite: closed
                ? { status: "closed", token, message: groupErrorLine(code) as string }
                : { status: "error", token, message: groupError(error, "This invite did not load. Try again.") },
            });
          }
        },

        loadMine: async () => {
          try {
            const groups = await api.listMyExpressGroups();
            const byId = { ...get().byId };
            for (const group of groups) byId[group.id] = group;
            // Tokens of groups that are no longer open are spent.
            const tokens = Object.fromEntries(
              Object.entries(get().tokens).filter(([id]) => groups.some((row) => row.id === id && row.state === "open")),
            );
            set({ available: "on", mine: groups, byId, tokens });
          } catch (error) {
            if (groupsMissing(error)) set({ available: "off", mine: [] });
          }
        },

        load: async (id) => {
          try {
            const group = await api.getExpressGroup(id);
            const { [id]: _old, ...loadError } = get().loadError;
            set({ byId: { ...get().byId, [id]: group }, loadError, available: "on" });
            return group;
          } catch (error) {
            const code = apiErrorCode(error);
            if (code === "group_membership_required" || code === "group_not_found") {
              drop(id);
              const line = code === "group_not_found" ? "This group is not open to you. Nothing of yours was ordered." : (groupErrorLine(code) as string);
              set({ gone: { ...get().gone, [id]: line } });
              return null;
            }
            set({ loadError: { ...get().loadError, [id]: groupError(error, "This group did not load. Try again.") } });
            return null;
          }
        },

        loadTracking: async (id) => {
          try {
            const tracking = await api.getExpressGroupTracking(id);
            set({ tracking: { ...get().tracking, [id]: tracking } });
          } catch {
            // The group itself still says where things stand.
          }
        },

        create: (setup) =>
          run("create", "The group was not started. Try again.", async () => {
            const { group, inviteToken } = await api.createExpressGroup(setup);
            put(group);
            set({ tokens: { ...get().tokens, [group.id]: inviteToken } });
            return group;
          }),

        join: (token) =>
          run("join", "You did not join. Try again.", async () => {
            const group = await api.joinExpressGroup(token);
            put(group);
            return group;
          }),

        saveFiles: async (id, files) =>
          (await run("files", "Your files were not saved. Try again.", async () => {
            put(await api.saveExpressGroupFiles(id, files));
            return true;
          })) === true,

        leave: async (id) =>
          (await run("leave", "You are still in the group. Try again.", async () => {
            await api.leaveExpressGroup(id);
            drop(id);
            return true;
          })) === true,

        remove: async (id, userId) =>
          (await run("remove", "They are still in the group. Try again.", async () => {
            put(await api.removeExpressGroupMember(id, userId));
            return true;
          })) === true,

        close: async (id) =>
          (await run("close", "Checkout did not open. Try again.", async () => {
            put(await api.closeExpressGroup(id));
            return true;
          })) === true,

        cancel: async (id) =>
          (await run("cancel", "The group was not cancelled. Try again.", async () => {
            put(await api.cancelExpressGroup(id));
            return true;
          })) === true,

        setPaidBack: async (id, userId, paidBack) =>
          (await run("paid_back", "That tick did not save. Try again.", async () => {
            put(await api.setExpressGroupPaidBack(id, userId, paidBack));
            return true;
          })) === true,

        decide: async (id, decision) =>
          (await run("decision", "Your choice did not save. Try again.", async () => {
            put(await api.decideExpressGroupShop(id, decision));
            void get().loadTracking(id);
            return true;
          })) === true,

        clearError: () => set({ error: null }),

        reset: () =>
          set({ available: "unknown", mine: null, byId: {}, tracking: {}, tokens: {}, loadError: {}, gone: {}, busy: null, error: null, invite: null }),
      };
    },
    {
      name: "gridgo.client.expressGroupTokens.v1",
      storage: createPersistStorage(),
      // Only the invite tokens: everything else is GRIDGO's live answer.
      partialize: (state) => ({ tokens: state.tokens }) as unknown as GroupState,
    },
  ),
);
