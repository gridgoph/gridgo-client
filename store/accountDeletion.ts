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
  getAccountDeletionRequest,
  recoverUnauthorizedSession,
  revokeAppleAuthorization,
  type AccountDeletionRequest,
  type PrivacyRequest,
} from "@/lib/api";
import { appleAuthorizationCode } from "@/lib/appleReauth";
import {
  APPLE_CANCELLED,
  APPLE_CHECK_FAILED,
  APPLE_PREPARE_FAILED,
  APPLE_REVOCATION_CLIENT_ID,
  APPLE_SIGN_IN_FAILED,
  appleRetryWait,
  recordedRevocation,
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
 * disconnecting Sign in with Apple (`lib/appleRevocation.ts`). That step
 * belongs to the account and its pending deletion request, not to one visit
 * of the screen, so what it learned lives in `appleMemory` and survives
 * `reset`: a revocation that succeeded is never followed by another Apple
 * sign-in, and a code whose answer was lost is replayed rather than replaced.
 * Apple's code is held there only, outside the state, so it never reaches a
 * render, a log or storage. The identity ending, or another account signing
 * in (`forgetAppleRevocation` / `claimAppleRevocation`, from
 * `store/session.ts`), drops it.
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
  /** The Clerk user the Apple step runs for. */
  appleOwner: string | null;
  /** Why the Apple step stopped, already plain language. */
  appleError: string | null;
  /** What the person can do about `appleError`. */
  appleNext: AppleRevocationNext;
  setSecret: (secret: string) => void;
  emailCode: (session: ReverifySession | null | undefined) => Promise<void>;
  /**
   * `appleOwner`: the Clerk user id when this account must also disconnect
   * Sign in with Apple, otherwise null.
   */
  submit: (
    method: DeletionConfirmMethod,
    session: ReverifySession | null | undefined,
    appleOwner?: string | null,
  ) => Promise<void>;
  /** Disconnect Sign in with Apple; never asks Apple again once it succeeded. */
  revokeApple: () => Promise<void>;
  /** After GRIDGO refused the sign-in: clear the session so it can be restored. */
  restoreSession: () => void;
  reset: () => void;
};

export type AppleStep = "pending" | "authorizing" | "revoking" | "revoked" | "failed";

/** What the Apple step knows about one account-deletion request. */
type AppleRequestMemory = {
  /** Apple's single-use code, kept only while it can still be replayed. */
  code: string | null;
  /** GRIDGO answered `revoked` for this request. */
  revoked: boolean;
};

/** What the Apple step knows for one account. */
type AppleMemory = {
  owner: string;
  /** The account-deletion request is on file. */
  filed: boolean;
  /** The pending request GRIDGO last named; a failed read falls back to it. */
  requestId: string | null;
  /** Kept per request, so a late answer lands only on the request it was for. */
  requests: Map<string, AppleRequestMemory>;
};

let appleMemory: AppleMemory | null = null;
/** The GRIDGO account signed in while the memory was made. */
let appleAccount: string | null = null;

function appleMemoryFor(owner: string): AppleMemory {
  if (appleMemory?.owner !== owner) {
    appleMemory = { owner, filed: false, requestId: null, requests: new Map() };
  }
  return appleMemory;
}

function requestMemory(memory: AppleMemory, id: string): AppleRequestMemory {
  let request = memory.requests.get(id);
  if (!request) {
    request = { code: null, revoked: false };
    memory.requests.set(id, request);
  }
  return request;
}

/** Drop everything the Apple step holds: the identity ended. */
export function forgetAppleRevocation(): void {
  appleMemory = null;
  appleAccount = null;
}

/** A GRIDGO account signed in; a different one than before drops the memory. */
export function claimAppleRevocation(account: string): void {
  if (appleAccount && appleAccount !== account) appleMemory = null;
  appleAccount = account;
}

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
  appleOwner: null,
  appleError: null,
  appleNext: null,
};

export const useAccountDeletion = create<AccountDeletionState>((set, get) => {
  /** Writes for the screen that started this work, and only while it is open. */
  const screenFor = (mine: number) => ({
    closed: () => mine !== flow,
    set: (patch: Partial<AccountDeletionState>) => {
      if (mine === flow) set(patch);
    },
  });

  const runApple = async (owner: string, mine: number) => {
    const screen = screenFor(mine);
    const memory = appleMemoryFor(owner);
    const fail = (message: string, next: AppleRevocationNext) =>
      screen.set({ apple: "failed", appleError: message, appleNext: next });
    screen.set({ apple: "revoking", appleError: null, appleNext: null });

    if (!memory.filed) {
      try {
        await fileAccountDeletionRequest();
        memory.filed = true;
      } catch {
        fail(APPLE_PREPARE_FAILED, "retry");
        return;
      }
      if (screen.closed()) return;
    }

    // What GRIDGO already recorded for this request decides whether Apple is
    // asked at all: after a success it never is, even after a restart.
    let pending: AccountDeletionRequest | null | undefined;
    try {
      pending = await getAccountDeletionRequest();
    } catch {
      pending = undefined;
    }
    if (screen.closed()) return;
    if (pending === null) {
      memory.filed = false;
      fail(APPLE_PREPARE_FAILED, "retry");
      return;
    }
    if (pending) memory.requestId = pending.id;
    const requestId = memory.requestId;
    if (!requestId) {
      fail(APPLE_CHECK_FAILED, "retry");
      return;
    }
    const request = requestMemory(memory, requestId);
    // An answered read is GRIDGO's latest word for this app, even over a
    // success this phone heard; a failed read falls back to what it heard.
    const recorded = pending ? recordedRevocation(pending) : null;
    if (recorded) request.revoked = recorded.status === "revoked";
    if (request.revoked) {
      request.code = null;
      screen.set({ apple: "revoked", appleError: null, appleNext: null });
      return;
    }

    if (!request.code) {
      // A fresh sign-in only once GRIDGO has said nothing is recorded yet.
      if (pending === undefined) {
        fail(APPLE_CHECK_FAILED, "retry");
        return;
      }
      screen.set({ apple: "authorizing" });
      let fresh: string | null;
      try {
        fresh = await appleAuthorizationCode();
      } catch (error) {
        fail(isAppleCancel(error) ? APPLE_CANCELLED : APPLE_SIGN_IN_FAILED, "sign_in");
        return;
      }
      if (!fresh) {
        fail(APPLE_SIGN_IN_FAILED, "sign_in");
        return;
      }
      // Kept even if the screen closed meanwhile: the next visit sends it.
      request.code = fresh;
      if (screen.closed()) return;
      screen.set({ apple: "revoking" });
    }

    const code = request.code;
    const result = await revokeWithSameCode(() => sendAppleCode(code), appleRetryWait, screen.closed);
    // The answer belongs to the request it was sent for, so it is kept whether
    // or not the screen is still open, and only a code still held is dropped.
    const spend = () => {
      if (request.code === code) request.code = null;
    };
    if (result.status === "revoked") {
      const answered = result.requestId ?? requestId;
      (answered === requestId ? request : requestMemory(memory, answered)).revoked = true;
      spend();
      screen.set({ apple: "revoked", appleError: null, appleNext: null });
      return;
    }
    if (result.code === "account_deletion_request_required") memory.filed = false;
    if (result.next === "sign_in" || result.next === null) spend();
    fail(result.message, result.next);
  };

  return {
    ...initial,

    setSecret: (secret) => set({ secret, fieldError: null }),

    emailCode: async (session) => {
      if (get().busy) return;
      if (!session) {
        set({ error: DELETION_NO_SESSION });
        return;
      }
      const screen = screenFor(flow);
      set({ busy: "emailing", error: null, fieldError: null });
      const outcome = await sendDeletionCode(session);
      screen.set(
        outcome.status === "ok"
          ? { busy: null, codeSent: true, destination: outcome.destination, secret: "" }
          : { busy: null, error: outcome.message },
      );
    },

    submit: async (method, session, appleOwner = null) => {
      if (get().busy) return;
      // Taken before any wait: a screen closed meanwhile gets no more writes
      // and starts no Apple work. Whatever reached GRIDGO stays filed.
      const mine = flow;
      const screen = screenFor(mine);
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
        if (screen.closed()) return;
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
      let request: PrivacyRequest;
      try {
        // The privacy queue (`docs/LEGAL_API.md`), not the legacy
        // `/me/account-deletion-request`: it is where See my data and Correct my
        // data land too, with a due date and a record of what was kept. An
        // Apple-linked iPhone account also files the legacy one in `runApple`,
        // because Apple's revocation attaches to it.
        request = await createPrivacyRequest("deletion");
      } catch {
        screen.set({ busy: null, error: DELETION_REQUEST_FAILED });
        return;
      }
      if (screen.closed()) return;
      set({
        busy: null,
        sent: true,
        secret: "",
        request,
        apple: appleOwner ? "pending" : null,
        appleOwner,
      });
      // The request stands whatever Apple does next.
      if (appleOwner) await runApple(appleOwner, mine);
    },

    revokeApple: async () => {
      const { apple, appleOwner } = get();
      if (!appleOwner || (apple !== "pending" && apple !== "failed")) return;
      await runApple(appleOwner, flow);
    },

    restoreSession: () => recoverUnauthorizedSession(),

    reset: () => {
      flow += 1;
      set(initial);
    },
  };
});
