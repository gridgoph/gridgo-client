import { create } from "zustand";

import {
  confirmationStands,
  confirmWithCode,
  confirmWithPassword,
  DELETION_NO_SESSION,
  DELETION_REQUEST_FAILED,
  sendDeletionCode,
  type DeletionConfirmMethod,
  type ReverifySession,
} from "@/lib/accountDeletion";
import {
  ApiError,
  createPrivacyRequest,
  fileAccountDeletionRequest,
  revokeAppleAuthorization,
  type PrivacyRequest,
} from "@/lib/api";
import { appleAuthorizationCode } from "@/lib/appleReauth";
import {
  APPLE_CANCELLED,
  APPLE_PREPARE_FAILED,
  APPLE_REVOCATION_CLIENT_ID,
  APPLE_SIGN_IN_FAILED,
  appleRetryWait,
  revokeWithSameCode,
  type AppleRevocationNext,
  type AppleRevocationReply,
} from "@/lib/appleRevocation";
import { isAppleCancel } from "@/lib/appleSignIn";

/**
 * The Delete account screen's flow: confirm it is the account holder, then
 * send the request.
 *
 * A store rather than `useState` for the reason `store/loginFlow.ts` gives:
 * every step lands from an async continuation, and on this test stack a plain
 * `useState` write there never re-renders. Nothing is persisted — the password
 * and the code live only while the screen is open, and `reset` on leaving
 * drops them.
 *
 * On an iPhone account linked to Apple, a sent request is followed by
 * disconnecting Sign in with Apple (`lib/appleRevocation.ts`). Apple's
 * single-use code is held in this module, outside the state, so it never
 * reaches a render, a log or storage; `reset` drops it.
 */
type AccountDeletionState = {
  /** Typed password or emailed code. Never persisted, never logged. */
  secret: string;
  /** A code has been emailed and is waiting to be typed. */
  codeSent: boolean;
  /** Where Clerk sent the code, masked by Clerk. */
  destination: string;
  busy: "checking" | "sending" | "emailing" | null;
  /** About what was typed: drawn under the field. */
  fieldError: string | null;
  /** About everything else: drawn as a notice. */
  error: string | null;
  /** When the account holder last proved it was them, for a retried send. */
  confirmedAt: number | null;
  sent: boolean;
  /** The privacy request the send created, for its answer-by date. */
  request: PrivacyRequest | null;
  /**
   * Disconnecting Sign in with Apple after the request is sent. `null` when
   * it does not apply: not an iPhone, or no Apple account linked.
   */
  apple: AppleStep | null;
  /** Why the Apple step stopped, already plain language. */
  appleError: string | null;
  /** What the person can do about `appleError`. */
  appleNext: AppleRevocationNext;
  setSecret: (secret: string) => void;
  emailCode: (session: ReverifySession | null | undefined) => Promise<void>;
  /** `apple`: whether this account must also disconnect Sign in with Apple. */
  submit: (
    method: DeletionConfirmMethod,
    session: ReverifySession | null | undefined,
    apple?: boolean,
  ) => Promise<void>;
  /** Disconnect Sign in with Apple; never runs again once it succeeded. */
  revokeApple: () => Promise<void>;
  reset: () => void;
};

export type AppleStep = "pending" | "authorizing" | "revoking" | "revoked" | "failed";

/** Apple's single-use code. Never in state, never logged, never persisted. */
let appleCode: string | null = null;
/** The account-deletion request the revocation attaches to is on file. */
let deletionFiled = false;
/** Bumped by `reset`, so a step still running for a closed screen lands nowhere. */
let flow = 0;

async function sendAppleCode(code: string): Promise<AppleRevocationReply> {
  try {
    return { kind: "answered", body: await revokeAppleAuthorization(APPLE_REVOCATION_CLIENT_ID, code) };
  } catch (error) {
    // Anything but an HTTP answer is an answer that never arrived.
    return error instanceof ApiError ? { kind: "refused", body: error.body } : { kind: "lost" };
  }
}

const initial = {
  secret: "",
  codeSent: false,
  destination: "",
  busy: null,
  fieldError: null,
  error: null,
  confirmedAt: null,
  sent: false,
  request: null,
  apple: null,
  appleError: null,
  appleNext: null,
};

export const useAccountDeletion = create<AccountDeletionState>((set, get) => ({
  ...initial,

  setSecret: (secret) => set({ secret, fieldError: null }),

  emailCode: async (session) => {
    if (get().busy) return;
    if (!session) {
      set({ error: DELETION_NO_SESSION });
      return;
    }
    set({ busy: "emailing", error: null, fieldError: null });
    try {
      const outcome = await sendDeletionCode(session);
      if (outcome.status === "ok") {
        set({ codeSent: true, destination: outcome.destination, secret: "" });
      } else {
        set({ error: outcome.message });
      }
    } finally {
      set({ busy: null });
    }
  },

  submit: async (method, session, apple = false) => {
    if (get().busy) return;
    set({ error: null, fieldError: null });

    // Only the send can fail once the person is confirmed. A retry inside the
    // window goes straight to the send rather than spending another code.
    if (!confirmationStands(get().confirmedAt, Date.now())) {
      if (!session) {
        set({ error: DELETION_NO_SESSION });
        return;
      }
      set({ busy: "checking" });
      const secret = get().secret;
      const outcome =
        method === "password"
          ? await confirmWithPassword(session, secret)
          : await confirmWithCode(session, secret);
      if (outcome.status !== "ok") {
        set(
          outcome.status === "refused"
            ? { busy: null, fieldError: outcome.message }
            : { busy: null, error: outcome.message },
        );
        return;
      }
      set({ confirmedAt: Date.now(), secret: "" });
    }

    set({ busy: "sending" });
    try {
      // The privacy queue (`docs/LEGAL_API.md`), not the legacy
      // `/me/account-deletion-request`: it is where See my data and Correct my
      // data land too, with a due date and a record of what was kept. An
      // Apple-linked iPhone account also files the legacy one in `revokeApple`,
      // because Apple's revocation attaches to it.
      const request = await createPrivacyRequest("deletion");
      set({ sent: true, secret: "", request, apple: apple ? "pending" : null });
    } catch {
      set({ error: DELETION_REQUEST_FAILED });
      return;
    } finally {
      set({ busy: null });
    }
    // The request stands whatever Apple does next.
    if (apple) await get().revokeApple();
  },

  revokeApple: async () => {
    const step = get().apple;
    if (step !== "pending" && step !== "failed") return;
    set({ apple: "revoking", appleError: null, appleNext: null });
    const mine = flow;
    const closed = () => mine !== flow;

    const fail = (message: string, next: AppleRevocationNext) => {
      if (closed()) return;
      if (next !== "retry") appleCode = null;
      set({ apple: "failed", appleError: message, appleNext: next });
    };

    if (!deletionFiled) {
      try {
        await fileAccountDeletionRequest();
        if (closed()) return;
        deletionFiled = true;
      } catch {
        fail(APPLE_PREPARE_FAILED, "retry");
        return;
      }
    }

    if (!appleCode) {
      set({ apple: "authorizing" });
      let fresh: string | null;
      try {
        fresh = await appleAuthorizationCode();
      } catch (error) {
        fail(isAppleCancel(error) ? APPLE_CANCELLED : APPLE_SIGN_IN_FAILED, "sign_in");
        return;
      }
      if (closed()) return;
      appleCode = fresh;
      if (!appleCode) {
        fail(APPLE_SIGN_IN_FAILED, "sign_in");
        return;
      }
      set({ apple: "revoking" });
    }

    const code = appleCode;
    const result = await revokeWithSameCode(() => sendAppleCode(code), appleRetryWait);
    if (closed()) return;
    if (result.status === "revoked") {
      appleCode = null;
      set({ apple: "revoked", appleError: null, appleNext: null });
      return;
    }
    // The request this would attach to has gone: file it again on the retry.
    if (result.code === "account_deletion_request_required") deletionFiled = false;
    fail(result.message, result.next);
  },

  reset: () => {
    flow += 1;
    appleCode = null;
    deletionFiled = false;
    set(initial);
  },
}));
