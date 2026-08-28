import { create } from "zustand";

import type { ClientAddress, User } from "@/lib/api";
import {
  applySteps,
  applyStepProblem,
  businessApplyInput,
  BUSINESS_APPLY_NOT_OPEN_YET,
  emptyApplyDraft,
  loadApplyAddresses,
  submitBusinessApply,
  type AccountOutcome,
  type ApplyStep,
  type BusinessApplyDraft,
} from "@/lib/accountProfile";
import { useSession } from "@/store/session";

/**
 * Where a client is in the business application.
 *
 * The step lives in a store rather than in the screen's own `useState` for a
 * reason this project keeps rediscovering: under React 19 with
 * `@testing-library/react-native` 14, a plain `useState` update made from an
 * async continuation is dropped — the setter runs and the tree never
 * re-renders — while a Zustand write in the same position does re-render. Two
 * things here arrive that way (the saved addresses, and the answer to the
 * submission), so a screen holding its own step would be untestable at exactly
 * the point worth testing. `store/loginFlow.ts` and `store/signupFlow.ts` are
 * here for the same reason.
 *
 * Nothing is persisted. This is a few minutes' work carrying a phone number,
 * and an application half-finished last week is not one a client wants
 * resumed silently — the account it would have changed may have changed since.
 */

export type ApplyNotice = {
  message: string;
  /** True where the route is simply not deployed yet, not a client mistake. */
  notOpenYet: boolean;
};

export type BusinessApplyState = {
  steps: ApplyStep[];
  index: number;
  draft: BusinessApplyDraft;
  /** Null until the addresses have been asked for. */
  addresses: ClientAddress[] | null;
  addressNotice: string | null;
  /** Held back until Continue is pressed, so a field is not red while typing. */
  showProblem: boolean;
  submitting: boolean;
  notice: ApplyNotice | null;

  start: (user: User | null) => void;
  edit: (patch: Partial<BusinessApplyDraft>) => void;
  next: () => void;
  back: () => void;
  loadAddresses: () => Promise<void>;
  submit: () => Promise<boolean>;
  reset: () => void;
};

const EMPTY = {
  steps: applySteps(null),
  index: 0,
  draft: emptyApplyDraft(null),
  addresses: null,
  addressNotice: null,
  showProblem: false,
  submitting: false,
  notice: null,
} as const;

export const useBusinessApply = create<BusinessApplyState>((set, get) => ({
  ...EMPTY,

  start: (user) =>
    set({
      ...EMPTY,
      steps: applySteps(user),
      draft: emptyApplyDraft(user),
    }),

  edit: (patch) =>
    set((state) => ({
      draft: { ...state.draft, ...patch },
      // Editing answers the complaint the screen was making about this step.
      showProblem: false,
      // A refusal was about what was on screen a moment ago.
      notice: null,
    })),

  next: () => {
    const { steps, index, draft } = get();
    const step = steps[index];
    if (!step) return;
    if (applyStepProblem(step.id, draft)) {
      set({ showProblem: true });
      return;
    }
    if (index >= steps.length - 1) return;
    set({ index: index + 1, showProblem: false });
  },

  back: () => set((state) => ({ index: Math.max(0, state.index - 1), showProblem: false })),

  loadAddresses: async () => {
    if (get().addresses) return;
    const outcome = await loadApplyAddresses();
    if (outcome.status === "ok") {
      set({ addresses: outcome.value, addressNotice: null });
      return;
    }
    // Not being able to read saved addresses does not stop an upgrade — the
    // drop-off is asked for again at checkout either way. So the list becomes
    // empty and the reason is stated beside it.
    set({
      addresses: [],
      addressNotice:
        outcome.status === "not_open_yet"
          ? "GRIDGO has not opened saved addresses on this app yet. You can set one at checkout."
          : outcome.message,
    });
  },

  submit: async () => {
    const { submitting, draft, addresses } = get();
    if (submitting) return false;
    set({ submitting: true, notice: null });
    // Where orders go is sent whole, so the application resolves the choice
    // against the list this step actually offered rather than trusting an id
    // the server would have to look up.
    const address = addresses?.find((candidate) => candidate.id === draft.addressId) ?? null;
    const outcome = await submitBusinessApply(businessApplyInput(draft, address));

    if (outcome.status === "ok") {
      // The account really is a business now, so the session carries GRIDGO's
      // answer rather than the app's guess at it. Never written locally on any
      // other outcome: the next `/me` would overwrite it, and meanwhile the
      // client would be told they are something the platform has not heard of.
      useSession.getState().setUser(outcome.value);
      set({ submitting: false, notice: null });
      return true;
    }

    set({ submitting: false, notice: applyNotice(outcome) });
    return false;
  },

  reset: () => set({ ...EMPTY }),
}));

/** A refused application, said in the client's words rather than a status. */
function applyNotice(
  outcome: Exclude<AccountOutcome<User>, { status: "ok" }>,
): ApplyNotice {
  switch (outcome.status) {
    case "not_open_yet":
      return { message: BUSINESS_APPLY_NOT_OPEN_YET, notOpenYet: true };
    case "stale":
      return {
        message:
          "Your account changed while you were filling this in. Close this and start again so nothing is overwritten.",
        notOpenYet: false,
      };
    default:
      return { message: outcome.message, notOpenYet: false };
  }
}
