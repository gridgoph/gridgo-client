import { create } from "zustand";
import * as api from "@/lib/api";
import { repaymentState } from "@/lib/cash";
import { userFacingError } from "@/lib/copy";
import { liveGeneration } from "@/lib/live";
import { checkPaymentReference } from "@/lib/payment";
import { useCashPayment } from "@/store/checkoutPayment";

type State = {
  orderId: string | null;
  cash: api.CashDetail | null;
  loading: boolean;
  loadError: string | null;
  busy: boolean;
  error: string | null;
  attempt: { body: string; key: string } | null;
  load: (orderId: string) => Promise<void>;
  submit: (orderId: string) => Promise<void>;
  reset: () => void;
};
let generation = 0;

/** Pending/rejected belong to GRIDGO; only a retry's idempotency key lives here. */
export const useCashRepayment = create<State>((set, get) => ({
  orderId: null, cash: null, loading: false, loadError: null, busy: false, error: null, attempt: null,
  load: async (orderId) => {
    const run = ++generation;
    const owner = liveGeneration();
    if (get().orderId !== orderId) set({ orderId, cash: null, attempt: null, error: null });
    set({ loading: true, loadError: null });
    try {
      const cash = await api.getOrderCash(orderId);
      if (run === generation && owner === liveGeneration()) set({ cash });
    } catch (error) {
      if (run === generation && owner === liveGeneration()) set({ loadError: userFacingError(error, "The cash status did not load. Refresh before making a transfer.") });
    } finally {
      if (run === generation && owner === liveGeneration()) set({ loading: false });
    }
  },
  submit: async (orderId) => {
    const state = get();
    const cash = state.cash;
    const draft = useCashPayment.getState();
    if (state.busy || state.loading || state.loadError || state.orderId !== orderId || draft.cartId !== orderId || !cash?.noShowApprovedAt || cash.repaymentConfirmedAt || cash.amountDueMinor <= 0
      || !["none", "rejected"].includes(repaymentState(cash)) || !draft.proof.fileId || !checkPaymentReference(draft.reference).ok || draft.ocr.status === "reading") return;
    const body: api.CashRepaymentBody = { expectedVersion: cash.version, amountMinor: cash.amountDueMinor, reference: draft.reference.trim(), proofFileId: draft.proof.fileId };
    const serialized = JSON.stringify(body);
    const attempt = state.attempt?.body === serialized ? state.attempt : { body: serialized, key: api.newIdempotencyKey() };
    const owner = liveGeneration();
    const current = () => owner === liveGeneration() && get().orderId === orderId;
    set({ busy: true, error: null, attempt });
    try {
      const result = await api.submitCashRepayment(orderId, body, attempt.key);
      if (!current()) return;
      // A successful submission is known even when an older API omits repayment.
      set({ cash: { ...cash, ...result, repayment: result.repayment ?? { status: "pending", submittedAt: new Date().toISOString(), rejectedAt: null, rejectionReason: null } }, attempt: null });
      useCashPayment.getState().reset();
    } catch (error) {
      if (!current()) return;
      set({ error: userFacingError(error, "Your receipt did not reach Operations. Your screenshot and reference are kept. Try again; do not pay twice.") });
      // A lost response can already have committed. Read before allowing a retry.
      await get().load(orderId);
    } finally {
      if (current()) set({ busy: false });
    }
  },
  reset: () => {
    generation++;
    set({ orderId: null, cash: null, loading: false, loadError: null, busy: false, error: null, attempt: null });
  },
}));
