import { create } from "zustand";

import * as api from "@/lib/api";
import type { OrganizationStatement, StatementPeriod } from "@/lib/api";
import { userFacingError } from "@/lib/copy";
import { customRangeProblem, organizationErrorMessage, type PeriodKind } from "@/lib/organization";
import { exportStatement, type ExportFormat } from "@/lib/statementExport";
import { useSession } from "@/store/session";

/**
 * The Organizations tab's statement (gridgo-client#160): the chosen period,
 * GRIDGO's totals for it, and the exports.
 *
 * Every figure is the API's. Nothing is added up on the phone — the statement
 * has to match the organization's closed orders exactly, and two sums of the
 * same orders that disagree by a centavo are worse than one.
 */

export type StatementStatus = "idle" | "loading" | "ready" | "failed";

type StatementsState = {
  ownerId: string | null;
  kind: PeriodKind;
  customFrom: string;
  customTo: string;
  statement: OrganizationStatement | null;
  status: StatementStatus;
  error: string | null;
  exporting: ExportFormat | null;
  exportNotice: { tone: "success" | "error"; message: string } | null;
  setKind: (kind: PeriodKind) => void;
  setCustom: (range: { from?: string; to?: string }) => void;
  load: () => Promise<void>;
  exportAs: (format: ExportFormat) => Promise<void>;
  reset: () => void;
};

const EMPTY = {
  ownerId: null,
  kind: "this_month" as PeriodKind,
  customFrom: "",
  customTo: "",
  statement: null,
  status: "idle" as StatementStatus,
  error: null,
  exporting: null,
  exportNotice: null,
};

let readSequence = 0;

/** The period to ask for, or null while a custom range is incomplete. */
export function requestedPeriod(
  state: Pick<StatementsState, "kind" | "customFrom" | "customTo">,
): StatementPeriod | null {
  if (state.kind !== "custom") return { kind: state.kind };
  if (customRangeProblem(state.customFrom, state.customTo)) return null;
  return { kind: "custom", from: state.customFrom, to: state.customTo };
}

function code(error: unknown): string | null {
  if (!(error instanceof api.ApiError)) return null;
  const body = error.body;
  return typeof body === "object" && body && "error" in body ? String((body as { error: unknown }).error) : null;
}

export const useStatements = create<StatementsState>((set, get) => ({
  ...EMPTY,

  setKind: (kind) => {
    set({ kind, exportNotice: null });
    if (kind !== "custom" || requestedPeriod(get())) void get().load();
  },

  setCustom: ({ from, to }) => {
    set((state) => ({
      customFrom: from ?? state.customFrom,
      customTo: to ?? state.customTo,
      exportNotice: null,
    }));
    if (requestedPeriod(get())) void get().load();
  },

  load: async () => {
    const ownerId = useSession.getState().user?.id ?? null;
    if (!ownerId) return;
    // Another account's statement is never shown; a first read keeps the period picked.
    const previous = get().ownerId;
    if (previous !== ownerId) set(previous ? { ...EMPTY, ownerId } : { ownerId });
    const period = requestedPeriod(get());
    if (!period) return;
    const sequence = ++readSequence;
    set({ status: "loading", error: null });
    try {
      const statement = await api.getOrganizationStatement(period);
      if (sequence !== readSequence) return;
      set({ statement, status: "ready", error: null });
    } catch (error) {
      if (sequence !== readSequence) return;
      set({
        status: "failed",
        statement: null,
        error:
          organizationErrorMessage(code(error)) ??
          userFacingError(error, "GRIDGO could not read this statement. Check your connection and try again."),
      });
    }
  },

  exportAs: async (format) => {
    const state = get();
    const period = requestedPeriod(state);
    if (state.exporting || !period || !state.statement) return;
    set({ exporting: format, exportNotice: null });
    const result = await exportStatement(period, state.statement.period, format);
    set({
      exporting: null,
      exportNotice: result.ok
        ? result.message
          ? { tone: "success", message: result.message }
          : null
        : { tone: "error", message: result.message },
    });
  },

  reset: () => set({ ...EMPTY }),
}));
