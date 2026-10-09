import { create } from "zustand";

import * as api from "@/lib/api";
import { CallEngine, type CallEngineDeps, type CallSnapshot } from "@/lib/callEngine";
import {
  loadCallAudio,
  loadCallMedia,
  readMicPermission,
  requestMicPermission,
} from "@/lib/callMedia";
import {
  CALL_END_HOLD_MS,
  callWindowOpen,
  isLiveCall,
  ringingIncoming,
  type OrderCall,
} from "@/lib/orderCalls";

/*
  The one call this phone can be on, and every way into it.

  Ways in: the call button on an order (`startCall`), an SSE `calls` pointer
  or a push (`checkOrder`), and the order screen's own read of its calls
  (`refreshOrderCalls`, which is also how a push that cold-started the app
  ends up ringing). All of them ring only for a call that is still ringing,
  was placed by the rider, and has not passed its deadline.

  Before a call starts there may be a question first — this build cannot
  call, or the microphone needs a word of explanation, or it is turned off —
  and that is `prompt`. Nothing starts ringing the rider until it is answered.

  The engine lives outside the state: React draws `session`, a snapshot.
*/

export type CallPrompt =
  | { kind: "unsupported" }
  | { kind: "mic-explainer"; orderId: string }
  | { kind: "mic-blocked" };

type CallStore = {
  session: CallSnapshot | null;
  /** Full screen, or folded into the bar at the top while the client looks at something else. */
  expanded: boolean;
  prompt: CallPrompt | null;
  /** This phone's calls per order, as last read. */
  callsByOrder: Record<string, OrderCall[]>;
  /** The incoming call's microphone was refused at Accept. */
  micRefused: boolean;

  startCall: (orderId: string) => Promise<void>;
  confirmMic: () => Promise<void>;
  closePrompt: () => void;
  accept: () => Promise<void>;
  decline: () => Promise<void>;
  hangUp: () => Promise<void>;
  toggleMute: () => void;
  toggleSpeaker: () => void;
  expand: () => void;
  minimize: () => void;
  /** Close an ended call's screen. */
  dismiss: () => void;
  refreshOrderCalls: (orderId: string) => Promise<OrderCall[] | null>;
  /** An SSE pointer or a push said this order's calls changed. */
  checkOrder: (orderId: string) => void;
  /** Look at every order in a calling window for a call still ringing. */
  sweepIncoming: () => Promise<void>;
  /** The app came back to the front. */
  resume: () => void;
  reset: () => void;
};

let engine: CallEngine | null = null;
let endTimer: ReturnType<typeof setTimeout> | null = null;
let lastSweep = 0;
// Bumped by `reset`: a read or permission prompt that started under the
// previous account must not write its calls back or ring for them.
let generation = 0;
const unsupportedRings = new Set<string>();
const SWEEP_MIN_INTERVAL_MS = 10_000;

/** Tests swap these for fakes. */
let depsOverride: Partial<CallEngineDeps> | null = null;
export function setCallDepsForTests(deps: Partial<CallEngineDeps> | null): void {
  depsOverride = deps;
}

function engineDeps(): CallEngineDeps | null {
  const media = depsOverride?.media ?? loadCallMedia();
  if (!media) return null;
  return {
    api: depsOverride?.api ?? api,
    media,
    audio: depsOverride?.audio ?? loadCallAudio(),
    ...(depsOverride?.now ? { now: depsOverride.now } : {}),
  };
}

function ongoing(session: CallSnapshot | null): boolean {
  return session != null && session.phase !== "ended";
}

export const useCall = create<CallStore>((set, get) => {
  const clearEndTimer = () => {
    if (endTimer) clearTimeout(endTimer);
    endTimer = null;
  };

  /** Wire a fresh engine to the store. */
  const attach = (next: CallEngine) => {
    engine?.dispose();
    clearEndTimer();
    engine = next;
    next.onIncomingInstead = (call) => ringFor(call);
    set({ session: next.state, expanded: true, micRefused: false });
  };

  const listener = (snapshot: CallSnapshot) => {
    if (!engine || engine.state !== snapshot) return;
    set({ session: snapshot });
    if (snapshot.phase !== "ended") return;
    void get().refreshOrderCalls(snapshot.orderId);
    // A call this phone hung up, or one the client declined, needs no reading:
    // the screen says "Call ended" for a beat and gets out of the way.
    const quiet = snapshot.ending?.reason === "ended_by_you" && !snapshot.ending.problem;
    if (quiet) {
      clearEndTimer();
      // Declining a ring closes at once; a hang-up holds "Call ended" a moment.
      const declined = snapshot.direction === "incoming" && snapshot.connectedAt == null && !snapshot.call?.acceptedAt;
      endTimer = setTimeout(() => {
        if (get().session === snapshot) get().dismiss();
      }, declined ? 0 : CALL_END_HOLD_MS);
    }
  };

  const ringFor = (call: OrderCall) => {
    const current = get().session;
    if (current?.call?.id === call.id) return;
    if (ongoing(current)) {
      // Already talking: the contract asks the second call to be declined.
      void api.actOnOrderCall(call.orderId, call.id, "decline").catch(() => undefined);
      return;
    }
    const deps = engineDeps();
    if (!deps) {
      // This build cannot answer. Say why, once per call rather than per pointer.
      if (!unsupportedRings.has(call.id)) {
        unsupportedRings.add(call.id);
        set({ prompt: { kind: "unsupported" } });
      }
      return;
    }
    const next = new CallEngine(call.orderId, "incoming", deps, listener);
    attach(next);
    next.ring(call);
  };

  const begin = (orderId: string) => {
    const deps = engineDeps();
    if (!deps) {
      set({ prompt: { kind: "unsupported" } });
      return;
    }
    const next = new CallEngine(orderId, "outgoing", deps, listener);
    attach(next);
    void next.place();
  };

  return {
    session: null,
    expanded: true,
    prompt: null,
    callsByOrder: {},
    micRefused: false,

    startCall: async (orderId) => {
      if (ongoing(get().session)) {
        set({ expanded: true });
        return;
      }
      if (!(depsOverride?.media ?? loadCallMedia())) {
        set({ prompt: { kind: "unsupported" } });
        return;
      }
      const started = generation;
      const permission = await readMicPermission();
      if (started !== generation) return;
      if (permission === "granted") return begin(orderId);
      set({ prompt: permission === "blocked" ? { kind: "mic-blocked" } : { kind: "mic-explainer", orderId } });
    },

    confirmMic: async () => {
      const prompt = get().prompt;
      if (prompt?.kind !== "mic-explainer") return;
      set({ prompt: null });
      const started = generation;
      const permission = await requestMicPermission();
      if (started !== generation) return;
      if (permission === "granted") begin(prompt.orderId);
      else set({ prompt: { kind: "mic-blocked" } });
    },

    closePrompt: () => set({ prompt: null }),

    accept: async () => {
      if (!engine || get().session?.phase !== "incoming") return;
      const current = engine;
      if ((await readMicPermission()) !== "granted" && (await requestMicPermission()) !== "granted") {
        // Keep ringing: the client can still turn it on, or decline.
        if (engine === current) set({ micRefused: true });
        return;
      }
      if (engine !== current) return;
      set({ micRefused: false });
      await current.accept();
    },

    decline: async () => {
      await engine?.decline();
    },

    hangUp: async () => {
      await engine?.hangUp();
    },

    toggleMute: () => {
      const session = get().session;
      if (engine && session) engine.setMuted(!session.muted);
    },

    toggleSpeaker: () => {
      const session = get().session;
      if (engine && session) engine.setSpeaker(!session.speaker);
    },

    expand: () => set({ expanded: true }),
    minimize: () => set({ expanded: false }),

    dismiss: () => {
      clearEndTimer();
      if (ongoing(get().session)) return;
      engine?.dispose();
      engine = null;
      set({ session: null, expanded: true, micRefused: false });
    },

    refreshOrderCalls: async (orderId) => {
      const started = generation;
      let calls: OrderCall[];
      try {
        calls = await api.listOrderCalls(orderId);
      } catch {
        return null;
      }
      if (started !== generation) return null;
      set((state) => ({ callsByOrder: { ...state.callsByOrder, [orderId]: calls } }));
      const ringing = ringingIncoming(calls);
      if (ringing) ringFor(ringing);
      return calls;
    },

    checkOrder: (orderId) => {
      const session = get().session;
      if (engine && session?.orderId === orderId && ongoing(session)) engine.poke();
      void get().refreshOrderCalls(orderId);
    },

    sweepIncoming: async () => {
      const now = Date.now();
      if (now - lastSweep < SWEEP_MIN_INTERVAL_MS) return;
      lastSweep = now;
      const started = generation;
      let orders: api.Order[];
      try {
        orders = await api.listOrders();
      } catch {
        return;
      }
      if (started !== generation) return;
      await Promise.all(
        orders.filter((order) => callWindowOpen(order)).map((order) => get().refreshOrderCalls(order.id)),
      );
    },

    resume: () => {
      const session = get().session;
      if (engine && ongoing(session)) engine.poke();
      lastSweep = 0;
      void get().sweepIncoming();
    },

    reset: () => {
      generation += 1;
      clearEndTimer();
      engine?.dispose();
      engine = null;
      lastSweep = 0;
      set({ session: null, expanded: true, prompt: null, callsByOrder: {}, micRefused: false });
    },
  };
});

/** The order's calls as last read, or an empty list. */
const NO_CALLS: OrderCall[] = [];

export function orderCallsOf(state: Pick<CallStore, "callsByOrder">, orderId: string): OrderCall[] {
  // One empty list, so a selector reading an unread order is stable between renders.
  return state.callsByOrder[orderId] ?? NO_CALLS;
}

/** Whether the order already has a live call (so its button opens the call instead). */
export function hasLiveCall(calls: OrderCall[]): boolean {
  return calls.some(isLiveCall);
}
