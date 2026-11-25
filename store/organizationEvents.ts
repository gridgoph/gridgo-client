import { create } from "zustand";

import { listOrders, type Order } from "@/lib/api";
import { refusalCode, saveSignedInFile } from "@/lib/fileSave";
import { onAccountChange, ownedReads } from "@/lib/ownedReads";
import { memberErrorMessage, refusal } from "@/lib/organizationMembers";
import * as events from "@/lib/organizationMembersApi";
import type { OrganizationEvent, OrganizationEventDetail } from "@/lib/organizationMembersApi";
import { EXPORT_NEEDS_REBUILD } from "@/lib/statementExport";
import { useOrganizationMembers, type ReadStatus } from "@/store/organizationMembers";

/**
 * Liquidation records: the organization's own orders grouped by event, and the
 * statement pack for each (gridgo-client#474). GRIDGO adds every total up.
 */

export type PackFormat = "pdf" | "csv";
export type PackNotice = { id: string; tone: "success" | "error"; message: string };

type State = {
  list: OrganizationEvent[];
  status: ReadStatus;
  error: string | null;
  event: OrganizationEventDetail | null;
  eventStatus: ReadStatus;
  eventError: string | null;
  orders: Order[];
  ordersStatus: ReadStatus;
  ordersError: string | null;
  /** The form: what the event will be called and hold. */
  name: string;
  picked: string[];
  /** Orders another event already holds, learned when GRIDGO said so. */
  taken: string[];
  saving: boolean;
  saveError: string | null;
  deleting: boolean;
  deleteError: string | null;
  packing: string | null;
  packNotice: PackNotice | null;

  loadList: () => Promise<void>;
  open: (id: string) => Promise<void>;
  loadOrders: () => Promise<void>;
  startForm: (event: OrganizationEventDetail | null) => void;
  setName: (name: string) => void;
  togglePicked: (orderId: string) => void;
  /** Resolves the event's id once it is stored. */
  save: () => Promise<string | null>;
  remove: () => Promise<boolean>;
  pack: (event: Pick<OrganizationEvent, "id" | "name">, format: PackFormat) => Promise<void>;
  reset: () => void;
};

const empty = () => ({
  list: [] as OrganizationEvent[],
  status: "idle" as ReadStatus,
  error: null,
  event: null,
  eventStatus: "idle" as ReadStatus,
  eventError: null,
  orders: [] as Order[],
  ordersStatus: "idle" as ReadStatus,
  ordersError: null,
  name: "",
  picked: [] as string[],
  taken: [] as string[],
  saving: false,
  saveError: null,
  deleting: false,
  deleteError: null,
  packing: null,
  packNotice: null,
});

const reads = ownedReads();

function takenOrders(error: unknown): string[] {
  const body = (error as { body?: unknown } | null)?.body as { orderIds?: unknown } | undefined;
  return Array.isArray(body?.orderIds) ? body.orderIds.filter((id): id is string => typeof id === "string") : [];
}

/** "Founders Night" → "founders-night", for the file the officer keeps. */
export function packFileName(name: string, format: PackFormat): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);
  return `${slug || "event"}-statement.${format}`;
}

export const useOrganizationEvents = create<State>((set, get) => ({
  ...empty(),

  loadList: async () => {
    set((state) => ({ status: state.status === "ready" ? "ready" : "loading", packNotice: null }));
    const result = await reads.run("list", events.listOrganizationEvents);
    if (!result) return;
    if (result.ok) set({ list: result.value, status: "ready", error: null });
    else set({ status: "failed", error: memberErrorMessage(result.error, "GRIDGO could not read your events. Check your connection and try again.") });
  },

  open: async (id) => {
    set((state) => ({
      event: state.event?.id === id ? state.event : null,
      eventStatus: state.event?.id === id ? state.eventStatus : "loading",
      eventError: null,
      deleteError: null,
      packNotice: null,
    }));
    const result = await reads.run("event", () => events.getOrganizationEvent(id));
    if (!result) return;
    if (result.ok) set({ event: result.value, eventStatus: "ready" });
    else set({ eventStatus: "failed", eventError: memberErrorMessage(result.error, "GRIDGO could not read this event. Check your connection and try again.") });
  },

  loadOrders: async () => {
    set((state) => ({ ordersStatus: state.ordersStatus === "ready" ? "ready" : "loading" }));
    const result = await reads.run("orders", listOrders);
    if (!result) return;
    if (result.ok) {
      set({
        orders: result.value.filter((order) => order.state !== "cancelled" && order.state !== "draft"),
        ordersStatus: "ready",
        ordersError: null,
      });
      return;
    }
    set({ ordersStatus: "failed", ordersError: memberErrorMessage(result.error, "GRIDGO could not read your orders. Check your connection and try again.") });
  },

  startForm: (event) =>
    set({
      event,
      name: event?.name ?? "",
      picked: event?.orders.map((row) => row.orderId) ?? [],
      taken: [],
      saveError: null,
    }),

  setName: (name) => set({ name, saveError: null }),

  togglePicked: (orderId) =>
    set((state) => ({
      saveError: null,
      picked: state.picked.includes(orderId) ? state.picked.filter((id) => id !== orderId) : [...state.picked, orderId],
    })),

  save: async () => {
    const { event, name, picked, saving } = get();
    if (saving || !name.trim()) return null;
    set({ saving: true, saveError: null });
    const result = await reads.run("save", () =>
      event
        ? events.updateOrganizationEvent(event.id, { expectedVersion: event.version, name: name.trim(), orderIds: picked })
        : events.createOrganizationEvent(name.trim(), picked),
    );
    if (!result) return null;
    if (result.ok) {
      set({ saving: false, event: result.value, eventStatus: "ready", eventError: null });
      void get().loadList();
      void useOrganizationMembers.getState().loadPartnership();
      return result.value.id;
    }
    const taken = takenOrders(result.error);
    set((state) => ({
      saving: false,
      saveError: memberErrorMessage(result.error, "GRIDGO could not save the event. Check your connection and try again."),
      taken: taken.length ? taken : state.taken,
      picked: state.picked.filter((id) => !taken.includes(id)),
    }));
    if (event && refusal(result.error) === "organization_event_stale") {
      await get().open(event.id);
      const latest = get().event;
      if (latest) set({ name: latest.name, picked: latest.orders.map((row) => row.orderId) });
    }
    return null;
  },

  remove: async () => {
    const { event, deleting } = get();
    if (!event || deleting) return false;
    set({ deleting: true, deleteError: null });
    const result = await reads.run("delete", () => events.deleteOrganizationEvent(event.id, event.version));
    if (!result) return false;
    if (result.ok || refusal(result.error) === "organization_event_not_found") {
      set((state) => ({ deleting: false, event: null, eventStatus: "idle", list: state.list.filter((row) => row.id !== event.id) }));
      void get().loadList();
      void useOrganizationMembers.getState().loadPartnership();
      return true;
    }
    set({ deleting: false, deleteError: memberErrorMessage(result.error, "The event was not deleted. Check your connection and try again.") });
    if (refusal(result.error) === "organization_event_stale") {
      const message = get().deleteError;
      await get().open(event.id);
      set({ deleteError: message });
    }
    return false;
  },

  pack: async (event, format) => {
    if (get().packing) return;
    set({ packing: `${event.id}:${format}`, packNotice: null });
    const notice = async (): Promise<PackNotice | null> => {
      try {
        const name = packFileName(event.name, format);
        const outcome = await saveSignedInFile(
          await events.eventPackRequest(event.id, format),
          name,
          format === "pdf" ? "application/pdf" : "text/csv",
        );
        if (outcome.kind === "saved") return outcome.message ? { id: event.id, tone: "success", message: outcome.message } : null;
        if (outcome.kind === "unavailable") return { id: event.id, tone: "error", message: EXPORT_NEEDS_REBUILD };
        return {
          id: event.id,
          tone: "error",
          message:
            refusalCode(outcome.body) === "organization_event_not_found"
              ? "This event was deleted."
              : "GRIDGO could not prepare that file. Try again in a moment.",
        };
      } catch {
        return { id: event.id, tone: "error", message: "GRIDGO could not prepare that file. Check your connection and try again." };
      }
    };
    set({ packNotice: await notice(), packing: null });
  },

  reset: () => {
    reads.cancel();
    set(empty());
  },
}));

onAccountChange(() => useOrganizationEvents.getState().reset());
