import { create } from "zustand";

import * as api from "@/lib/api";
import { userFacingError } from "@/lib/copy";
import {
  claimedLine,
  emailProblem,
  promotionErrorMessage,
  type ClaimKind,
  type ClaimOffer,
} from "@/lib/promotions";
import { useVouchers } from "@/store/vouchers";

export type PromotionNotice = { ok: boolean; text: string };

/**
 * The launch promotions as GRIDGO last answered them (`GET /me/promotions`).
 *
 * Never persisted: slots run out while the app is closed, and a phone that
 * remembered "28 left" would offer something GRIDGO can no longer give.
 *
 * "Not now" on the claim sheet is remembered here, in memory only, so the
 * sheet stays away for the rest of this app session and comes back on the
 * next sign-in or launch while there is still one to claim. It takes no slot.
 */
type PromotionsState = {
  data: api.Promotions | null;
  loading: boolean;
  error: string | null;
  /** The claim or invite in flight. */
  busy: ClaimKind | "invite" | null;
  /** What the last claim came to, said under the Redeem card and in the sheet. */
  claimNotice: PromotionNotice | null;
  /** What the last invite came to, said under the invite card. */
  inviteNotice: PromotionNotice | null;
  /** The offer the claim sheet is showing, latched while it is open. */
  sheet: ClaimOffer | null;
  /** Offers put away with "Not now" this app session. */
  dismissed: ClaimKind[];
  load: () => Promise<void>;
  /** Claims the Founding voucher or the waiting Friend Pass. Never throws. */
  claim: (kind: ClaimKind) => Promise<boolean>;
  /** Names one friend by email. Never throws. */
  invite: (email: string) => Promise<boolean>;
  openSheet: (offer: ClaimOffer) => void;
  /** "Not now": closes the sheet and keeps it away until the next sign-in. */
  dismissSheet: () => void;
  /** Closes the sheet without remembering anything (claimed, or signed out). */
  closeSheet: () => void;
  reset: () => void;
};

let generation = 0;

export const usePromotions = create<PromotionsState>()((set, get) => ({
  data: null,
  loading: false,
  error: null,
  busy: null,
  claimNotice: null,
  inviteNotice: null,
  sheet: null,
  dismissed: [],

  load: async () => {
    const mine = generation;
    set({ loading: true });
    try {
      const data = await api.getPromotions();
      if (mine !== generation) return;
      set({ data, loading: false, error: null });
    } catch (error) {
      if (mine !== generation) return;
      set({ loading: false, error: userFacingError(error, "GRIDGO could not load its launch offers.") });
    }
  },

  claim: async (kind) => {
    if (get().busy) return false;
    const mine = generation;
    set({ busy: kind, claimNotice: null });
    try {
      const data = kind === "founding" ? await api.claimFoundingVoucher() : await api.claimFriendPass();
      if (mine !== generation) return false;
      const voucher = kind === "founding" ? data.founding.voucher : data.friendPass.voucher;
      set({
        data,
        busy: null,
        error: null,
        claimNotice: { ok: true, text: claimedLine(voucher, kind) },
      });
      // The voucher is in the wallet now; checkout picks it up from there.
      void useVouchers.getState().load();
      return true;
    } catch (error) {
      if (mine !== generation) return false;
      set({
        busy: null,
        claimNotice: {
          ok: false,
          text: promotionErrorMessage(error, "claim", userFacingError(error, "GRIDGO could not add the voucher. Try again in a moment.")),
        },
      });
      // Whatever was refused, the offer on screen is stale: read it again.
      void get().load();
      return false;
    }
  },

  invite: async (raw) => {
    if (get().busy) return false;
    const problem = emailProblem(raw);
    if (problem) {
      set({ inviteNotice: { ok: false, text: problem } });
      return false;
    }
    const email = raw.trim().toLowerCase();
    const mine = generation;
    set({ busy: "invite", inviteNotice: null });
    try {
      const data = await api.inviteFriendPass(email);
      if (mine !== generation) return false;
      set({
        data,
        busy: null,
        error: null,
        inviteNotice: { ok: true, text: `Invite sent. ${email} sees it when they sign in to GRIDGO.` },
      });
      return true;
    } catch (error) {
      if (mine !== generation) return false;
      set({
        busy: null,
        inviteNotice: {
          ok: false,
          text: promotionErrorMessage(error, "invite", userFacingError(error, "GRIDGO could not send the invite. Try again in a moment.")),
        },
      });
      void get().load();
      return false;
    }
  },

  openSheet: (sheet) => set({ sheet, claimNotice: null }),
  dismissSheet: () =>
    set((state) => ({
      sheet: null,
      dismissed: state.sheet ? [...new Set([...state.dismissed, state.sheet.kind])] : state.dismissed,
    })),
  closeSheet: () => set({ sheet: null }),

  reset: () => {
    generation++;
    set({
      data: null,
      loading: false,
      error: null,
      busy: null,
      claimNotice: null,
      inviteNotice: null,
      sheet: null,
      dismissed: [],
    });
  },
}));
