import { create } from "zustand";

import * as api from "@/lib/api";
import type { ClientOrganization } from "@/lib/api";
import { userFacingError } from "@/lib/copy";
import { isApprovedOrganization, organizationErrorMessage } from "@/lib/organization";
import { useSession } from "@/store/session";

/**
 * The signed-in client's organization record: the officer of record, the
 * quarterly confirmation, and the case behind them (gridgo-client#164, #165).
 *
 * Read from `GET /me/organization`, never persisted — the officer is a fact
 * about responsibility, and a phone holding last month's answer is exactly the
 * outdated name #165 exists to catch. Tied to the account that read it, so a
 * different person signing in on the same phone never sees it.
 */

export type OrganizationStatus = "idle" | "loading" | "ready" | "failed";

type OrganizationState = {
  ownerId: string | null;
  organization: ClientOrganization | null;
  status: OrganizationStatus;
  error: string | null;
  confirming: boolean;
  confirmError: string | null;
  /** Set the moment a confirmation lands, so the screen can say so. */
  justConfirmed: boolean;
  load: () => Promise<void>;
  adopt: (organization: ClientOrganization | null) => void;
  confirm: () => Promise<boolean>;
  reset: () => void;
};

const EMPTY = {
  ownerId: null,
  organization: null,
  status: "idle" as OrganizationStatus,
  error: null,
  confirming: false,
  confirmError: null,
  justConfirmed: false,
};

let readSequence = 0;

function code(error: unknown): string | null {
  if (!(error instanceof api.ApiError)) return null;
  const body = error.body;
  return typeof body === "object" && body && "error" in body ? String((body as { error: unknown }).error) : null;
}

export const useOrganization = create<OrganizationState>((set, get) => ({
  ...EMPTY,

  load: async () => {
    const ownerId = useSession.getState().user?.id ?? null;
    if (!ownerId) return;
    const sequence = ++readSequence;
    set((state) => ({
      // Another account's record is never shown while this one loads.
      ...(state.ownerId !== ownerId ? { ...EMPTY, ownerId } : {}),
      status: state.ownerId === ownerId && state.status === "ready" ? "ready" : "loading",
      error: null,
    }));
    try {
      const organization = await api.getOrganization();
      if (sequence !== readSequence || useSession.getState().user?.id !== ownerId) return;
      set({ organization, status: "ready", error: null });
    } catch (error) {
      if (sequence !== readSequence || useSession.getState().user?.id !== ownerId) return;
      // No organization record (a personal account), or an API from before
      // organizations: neither is a failure to show anyone.
      if (error instanceof api.ApiError && (error.status === 404 || error.status === 405)) {
        set({ organization: null, status: "ready", error: null });
        return;
      }
      set({
        status: get().organization ? "ready" : "failed",
        error: userFacingError(error, "GRIDGO could not read your organization. Pull down to try again."),
      });
    }
  },

  adopt: (organization) =>
    set({ organization, ownerId: useSession.getState().user?.id ?? null, status: "ready", error: null }),

  confirm: async () => {
    const { organization, confirming } = get();
    const officerId = organization?.currentOfficer?.id;
    if (confirming || !officerId) return false;
    set({ confirming: true, confirmError: null, justConfirmed: false });
    try {
      const next = await api.confirmOrganizationOfficer(officerId);
      set({ organization: next, confirming: false, justConfirmed: true });
      return true;
    } catch (error) {
      set({
        confirming: false,
        confirmError:
          organizationErrorMessage(code(error)) ??
          userFacingError(error, "GRIDGO could not record that. Try again in a moment."),
      });
      // The officer moved under us: read what is true now.
      if (code(error) === "officer_changed" || code(error) === "officer_handover_pending") void get().load();
      return false;
    }
  },

  reset: () => set({ ...EMPTY }),
}));

/**
 * Whether the signed-in client is an approved organization — the gate for the
 * Organizations tab. The organization record only matters during an officer
 * handover, when the case is pending again but the account is still approved.
 */
export function useIsApprovedOrganization(): boolean {
  const user = useSession((s) => s.user);
  const organization = useOrganization((s) => (s.ownerId === user?.id ? s.organization : null));
  return isApprovedOrganization(user, organization);
}
