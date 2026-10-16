import type { OutgoingCallSignal } from "@/lib/api";
import type { CallAudio, CallMedia, CallPeer, CallStream } from "@/lib/callMedia";
import {
  CALL_HEARTBEAT_MS,
  CALL_POLL_MS,
  callErrorCode,
  callGone,
  callStartProblem,
  endReasonFor,
  isTerminalCall,
  liveOutgoing,
  partyName,
  ringingIncoming,
  type CallEndReason,
  type CallIceConfig,
  type CallPhase,
  type CallProblem,
  type CallSignal,
  type OrderCall,
} from "@/lib/orderCalls";

/*
  One call, from the first tap to the last packet.

  The contract (gridgo-api `docs/CALLS_API.md`) is HTTP for everything this
  phone says and a two-second poll for everything it hears, with the SSE
  `calls` pointer only making that poll come sooner (`poke`). So a dropped
  pointer, a backgrounded stream or a phone that slept through a push all end
  up in the same place: the next poll.

  It fails closed. Whatever ends the call — the other side, the server, a
  lease that could not be renewed, an audio path that died — this phone stops
  its microphone, closes the peer connection and goes quiet. The API cannot
  cut a direct media path itself, so this is the only place that can.

  It knows nothing about React. `store/call.ts` owns one and draws its
  snapshots.
*/

export type CallApi = {
  startOrderCall: (orderId: string) => Promise<OrderCall>;
  listOrderCalls: (orderId: string) => Promise<OrderCall[]>;
  getOrderCall: (orderId: string, callId: string) => Promise<OrderCall>;
  actOnOrderCall: (
    orderId: string,
    callId: string,
    action: "accept" | "decline" | "cancel" | "end" | "heartbeat",
  ) => Promise<OrderCall>;
  getOrderCallIce: (orderId: string, callId: string) => Promise<CallIceConfig>;
  sendOrderCallSignal: (orderId: string, callId: string, signal: OutgoingCallSignal) => Promise<{ id: number }>;
  listOrderCallSignals: (
    orderId: string,
    callId: string,
    after: number,
  ) => Promise<{ signals: CallSignal[]; cursor: number; call: OrderCall | null }>;
};

export type CallEnding = {
  reason: CallEndReason;
  /** Talk time, when the call connected. */
  durationMs: number | null;
  /** A refusal that stopped the call before it rang. */
  problem: CallProblem | null;
};

export type CallSnapshot = {
  orderId: string;
  direction: "outgoing" | "incoming";
  phase: CallPhase;
  call: OrderCall | null;
  /** The other person's first name, or "Your rider" until the server says. */
  peerName: string;
  connectedAt: number | null;
  muted: boolean;
  speaker: boolean;
  ending: CallEnding | null;
};

export type CallEngineDeps = {
  api: CallApi;
  media: CallMedia;
  audio: CallAudio;
  now?: () => number;
};

/** How long a dropped audio path may try to come back before the call is given up. */
export const RECONNECT_GRACE_MS = 15_000;
/** A ringing call nobody can reach the server about is given up this long after its deadline. */
const RING_SLACK_MS = 10_000;

export class CallEngine {
  private snapshot: CallSnapshot;
  private readonly deps: CallEngineDeps;
  private readonly listener: (snapshot: CallSnapshot) => void;
  private peer: CallPeer | null = null;
  private stream: CallStream | null = null;
  private cursor = 0;
  private seen = new Set<number>();
  private remoteSet = false;
  private pendingIce: CallSignal[] = [];
  private answered = false;
  private iceCount = 0;
  private sendQueue: Promise<unknown> = Promise.resolve();
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private polling = false;
  private pollAgain = false;
  private endedByMe = false;
  private connectionLost = false;
  private finished = false;

  constructor(
    orderId: string,
    direction: "outgoing" | "incoming",
    deps: CallEngineDeps,
    listener: (snapshot: CallSnapshot) => void,
  ) {
    this.deps = deps;
    this.listener = listener;
    this.snapshot = {
      orderId,
      direction,
      phase: direction === "outgoing" ? "preparing" : "incoming",
      call: null,
      peerName: "Your rider",
      connectedAt: null,
      muted: false,
      speaker: false,
      ending: null,
    };
  }

  get state(): CallSnapshot {
    return this.snapshot;
  }

  get callId(): string | null {
    return this.snapshot.call?.id ?? null;
  }

  private now(): number {
    return this.deps.now ? this.deps.now() : Date.now();
  }

  private update(patch: Partial<CallSnapshot>): void {
    if (this.finished && !patch.ending) return;
    this.snapshot = { ...this.snapshot, ...patch };
    this.listener(this.snapshot);
  }

  private adoptCall(call: OrderCall): void {
    this.update({ call, peerName: partyName(call) });
  }

  // -------------------------------------------------------------------------
  // Outgoing
  // -------------------------------------------------------------------------

  /** Open the microphone, start ringing the rider, and offer the audio. */
  async place(): Promise<void> {
    try {
      this.stream = await this.deps.media.microphone();
    } catch {
      this.finish("ended_by_you", {
        title: "The microphone did not open",
        body: "Another app may be using it. Close it and try again.",
      });
      return;
    }
    if (this.finished) return this.release();

    let call: OrderCall;
    try {
      call = await this.deps.api.startOrderCall(this.snapshot.orderId);
    } catch (error) {
      // A start that already went through (a lost response) or a rider calling
      // at the same moment: the contract says recover, never start another.
      if (callErrorCode(error) === "call_already_active") {
        const calls = await this.deps.api.listOrderCalls(this.snapshot.orderId).catch(() => []);
        const own = liveOutgoing(calls);
        if (own && !this.finished) {
          call = own;
        } else {
          this.finish("ended_by_you", callStartProblem(error), ringingIncoming(calls, this.now()));
          return;
        }
      } else {
        this.finish("ended_by_you", callStartProblem(error));
        return;
      }
    }
    if (this.finished) {
      // Hung up while the request was in flight.
      void this.deps.api.actOnOrderCall(call.orderId, call.id, "cancel").catch(() => undefined);
      return;
    }
    this.adoptCall(call);
    this.update({ phase: "ringing" });
    this.deps.audio.startCall(true);
    this.schedulePoll(0);

    try {
      const ice = await this.deps.api.getOrderCallIce(call.orderId, call.id);
      if (this.finished) return;
      const peer = this.openPeer(ice);
      const offer = await peer.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: false });
      await peer.setLocalDescription(offer);
      if (this.finished) return;
      await this.send({ clientId: "offer_1", kind: "offer", sdp: offer.sdp ?? "" });
    } catch (error) {
      if (this.finished) return;
      this.endFromHere(callGone(error) ? "unavailable" : "network_lost");
    }
  }

  // -------------------------------------------------------------------------
  // Incoming
  // -------------------------------------------------------------------------

  /** Ring for a call the rider placed. */
  ring(call: OrderCall): void {
    this.adoptCall(call);
    this.update({ phase: "incoming" });
    this.deps.audio.startRinging();
    this.schedulePoll(CALL_POLL_MS);
  }

  async accept(): Promise<void> {
    const call = this.snapshot.call;
    if (!call || this.snapshot.phase !== "incoming") return;
    this.deps.audio.stopRinging();
    this.update({ phase: "connecting" });
    try {
      this.stream = await this.deps.media.microphone();
    } catch {
      void this.deps.api.actOnOrderCall(call.orderId, call.id, "decline").catch(() => undefined);
      this.finish("ended_by_you", {
        title: "The microphone did not open",
        body: "Another app may be using it. Ask your rider to call again, or send a message.",
      });
      return;
    }
    if (this.finished) return this.release();
    try {
      const accepted = await this.deps.api.actOnOrderCall(call.orderId, call.id, "accept");
      this.adoptCall(accepted);
    } catch (error) {
      if (this.finished) return;
      // Too late: it stopped ringing first. Say what happened rather than "failed".
      const latest = await this.deps.api.getOrderCall(call.orderId, call.id).catch(() => null);
      if (latest && isTerminalCall(latest)) return this.applyCall(latest);
      this.finish(callGone(error) ? "missed" : "network_lost");
      return;
    }
    this.deps.audio.startCall(false);
    this.startHeartbeat();
    try {
      const ice = await this.deps.api.getOrderCallIce(call.orderId, call.id);
      if (this.finished) return;
      this.openPeer(ice);
    } catch (error) {
      if (this.finished) return;
      this.endFromHere(callGone(error) ? "unavailable" : "network_lost");
      return;
    }
    this.schedulePoll(0);
  }

  async decline(): Promise<void> {
    const call = this.snapshot.call;
    this.endedByMe = true;
    this.finish("ended_by_you");
    if (call) await this.deps.api.actOnOrderCall(call.orderId, call.id, "decline").catch(() => undefined);
  }

  // -------------------------------------------------------------------------
  // Either side
  // -------------------------------------------------------------------------

  /** End, or cancel a call still ringing. */
  async hangUp(): Promise<void> {
    if (this.snapshot.direction === "incoming" && this.snapshot.phase === "incoming") return this.decline();
    const call = this.snapshot.call;
    this.endedByMe = true;
    this.finish("ended_by_you");
    if (!call) return;
    const first = call.state === "accepted" ? "end" : "cancel";
    try {
      await this.deps.api.actOnOrderCall(call.orderId, call.id, first);
    } catch (error) {
      // It was answered as the cancel left: end the answered call instead.
      if (first === "cancel" && callErrorCode(error) === "invalid_call_transition") {
        await this.deps.api.actOnOrderCall(call.orderId, call.id, "end").catch(() => undefined);
      }
    }
  }

  setMuted(muted: boolean): void {
    for (const track of this.stream?.getAudioTracks() ?? []) track.enabled = !muted;
    this.update({ muted });
  }

  setSpeaker(speaker: boolean): void {
    this.deps.audio.setSpeaker(speaker);
    this.update({ speaker });
  }

  /** Something changed on the server (an SSE pointer, a push, a return to the app). */
  poke(): void {
    if (!this.finished) this.schedulePoll(0);
  }

  /** Stop everything without telling the server (sign-out, a replaced engine). */
  dispose(): void {
    this.finished = true;
    this.release();
  }

  // -------------------------------------------------------------------------
  // Plumbing
  // -------------------------------------------------------------------------

  private openPeer(ice: CallIceConfig): CallPeer {
    const peer = this.deps.media.createPeer(ice.iceServers);
    this.peer = peer;
    if (this.stream) {
      for (const track of this.stream.getAudioTracks()) {
        track.enabled = !this.snapshot.muted;
        peer.addTrack(track, this.stream);
      }
    }
    peer.addEventListener("icecandidate", (event: { candidate?: { candidate?: string; sdpMid?: string | null; sdpMLineIndex?: number | null } | null }) => {
      const candidate = event.candidate;
      // The end-of-candidates marker carries nothing the other side needs.
      if (!candidate?.candidate || this.finished) return;
      this.iceCount += 1;
      void this.send({
        clientId: `ice_${this.iceCount}`,
        kind: "ice",
        candidate: candidate.candidate,
        sdpMid: candidate.sdpMid ?? null,
        sdpMLineIndex: candidate.sdpMLineIndex ?? null,
      }).catch(() => undefined);
    });
    peer.addEventListener("iceconnectionstatechange", () => this.onConnectionState(peer.iceConnectionState));
    peer.addEventListener("connectionstatechange", () => {
      if (peer.connectionState === "failed") this.onConnectionState("failed");
    });
    return peer;
  }

  private onConnectionState(state: string | undefined): void {
    if (this.finished || !state) return;
    if (state === "connected" || state === "completed") {
      if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
      this.connectionLost = false;
      this.update({ phase: "connected", connectedAt: this.snapshot.connectedAt ?? this.now() });
      return;
    }
    if (state === "disconnected" && this.snapshot.phase === "connected") {
      this.connectionLost = true;
      this.update({ phase: "reconnecting" });
      if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
      this.reconnectTimer = setTimeout(() => this.endFromHere("network_lost"), RECONNECT_GRACE_MS);
      return;
    }
    if (state === "failed") {
      // One negotiation per call: a dead path cannot be restarted, only redialled.
      this.connectionLost = true;
      this.endFromHere("network_lost");
    }
  }

  /** Signals go out one at a time and in order; one retry covers a dropped response. */
  private send(signal: OutgoingCallSignal): Promise<unknown> {
    const call = this.snapshot.call;
    if (!call) return Promise.resolve();
    const attempt = () => this.deps.api.sendOrderCallSignal(call.orderId, call.id, signal);
    this.sendQueue = this.sendQueue
      .catch(() => undefined)
      .then(() => attempt().catch((error) => (callGone(error) ? Promise.reject(error) : attempt())));
    return this.sendQueue;
  }

  private schedulePoll(delay: number): void {
    if (this.finished) return;
    if (this.pollTimer) clearTimeout(this.pollTimer);
    this.pollTimer = setTimeout(() => void this.poll(), delay);
  }

  private async poll(): Promise<void> {
    this.pollTimer = null;
    if (this.finished) return;
    if (this.polling) {
      this.pollAgain = true;
      return;
    }
    const call = this.snapshot.call;
    if (!call) return;
    this.polling = true;
    try {
      if (this.snapshot.phase === "incoming" || !this.peer) {
        // Signals stay closed to the callee until it accepts, and are no use to
        // either side before its peer exists (they would be read and dropped).
        this.applyCall(await this.deps.api.getOrderCall(call.orderId, call.id));
      } else {
        const result = await this.deps.api.listOrderCallSignals(call.orderId, call.id, this.cursor);
        if (this.finished) return;
        if (result.call) this.applyCall(result.call);
        this.cursor = Math.max(this.cursor, result.cursor);
        for (const signal of result.signals) await this.applySignal(signal);
      }
    } catch (error) {
      if (this.finished) return;
      if (callGone(error)) {
        // Find out how it ended; if even that is refused, the window closed.
        const latest = await this.deps.api.getOrderCall(call.orderId, call.id).catch(() => null);
        if (latest && isTerminalCall(latest)) this.applyCall(latest);
        else this.finish("unavailable");
        return;
      }
      this.checkDeadlines();
    } finally {
      this.polling = false;
    }
    if (this.finished) return;
    if (this.pollAgain) {
      this.pollAgain = false;
      this.schedulePoll(0);
    } else {
      this.schedulePoll(CALL_POLL_MS);
    }
  }

  /** The poll could not reach GRIDGO. Past the call's own deadline, give up. */
  private checkDeadlines(): void {
    const call = this.snapshot.call;
    if (!call) return;
    const now = this.now();
    if (call.state === "ringing" && call.ringExpiresAt && now > Date.parse(call.ringExpiresAt) + RING_SLACK_MS) {
      this.finish("network_lost");
    } else if (call.state === "accepted" && call.leaseExpiresAt && now > Date.parse(call.leaseExpiresAt)) {
      this.finish("network_lost");
    }
  }

  private applyCall(call: OrderCall): void {
    if (this.finished) return;
    this.adoptCall(call);
    if (isTerminalCall(call)) {
      this.finish(
        endReasonFor({
          state: call.state,
          mine: call.mine,
          endedByMe: this.endedByMe,
          connectionLost: this.connectionLost,
        }),
      );
      return;
    }
    if (call.state === "accepted" && (this.snapshot.phase === "ringing" || this.snapshot.phase === "calling")) {
      this.deps.audio.stopRingback();
      this.update({ phase: "connecting" });
      this.startHeartbeat();
    }
  }

  private async applySignal(signal: CallSignal): Promise<void> {
    if (this.finished || this.seen.has(signal.id)) return;
    this.seen.add(signal.id);
    const peer = this.peer;
    if (!peer) return;
    try {
      if (signal.kind === "ice") {
        if (!signal.candidate) return;
        if (!this.remoteSet) {
          this.pendingIce.push(signal);
          return;
        }
        await this.addIce(peer, signal);
        return;
      }
      if (signal.kind === "answer" && this.snapshot.direction === "outgoing" && !this.remoteSet) {
        await peer.setRemoteDescription(this.deps.media.description({ type: "answer", sdp: signal.sdp }));
        await this.remoteReady(peer);
        return;
      }
      if (signal.kind === "offer" && this.snapshot.direction === "incoming" && !this.answered) {
        this.answered = true;
        await peer.setRemoteDescription(this.deps.media.description({ type: "offer", sdp: signal.sdp }));
        await this.remoteReady(peer);
        const answer = await peer.createAnswer();
        await peer.setLocalDescription(answer);
        if (this.finished) return;
        await this.send({ clientId: "answer_1", kind: "answer", sdp: answer.sdp ?? "" });
      }
    } catch (error) {
      if (this.finished) return;
      this.endFromHere(callGone(error) ? "unavailable" : "network_lost");
    }
  }

  private async remoteReady(peer: CallPeer): Promise<void> {
    this.remoteSet = true;
    const buffered = this.pendingIce;
    this.pendingIce = [];
    for (const signal of buffered) await this.addIce(peer, signal);
  }

  private async addIce(peer: CallPeer, signal: CallSignal): Promise<void> {
    if (signal.kind !== "ice") return;
    try {
      await peer.addIceCandidate(
        this.deps.media.candidate({
          candidate: signal.candidate,
          sdpMid: signal.sdpMid,
          sdpMLineIndex: signal.sdpMLineIndex,
        }),
      );
    } catch {
      // One unusable candidate is normal; the others carry the call.
    }
  }

  private startHeartbeat(): void {
    if (this.heartbeatTimer) return;
    this.heartbeatTimer = setInterval(() => void this.heartbeat(), CALL_HEARTBEAT_MS);
  }

  private async heartbeat(): Promise<void> {
    const call = this.snapshot.call;
    if (!call || this.finished) return;
    try {
      this.applyCall(await this.deps.api.actOnOrderCall(call.orderId, call.id, "heartbeat"));
    } catch (error) {
      if (this.finished) return;
      if (callGone(error)) this.schedulePoll(0);
      else this.checkDeadlines();
    }
  }

  /** This phone gives up on the call: tell the server, then stop. */
  private endFromHere(reason: CallEndReason): void {
    const call = this.snapshot.call;
    this.finish(reason);
    if (!call) return;
    const action = call.state === "accepted" ? "end" : call.mine ? "cancel" : "decline";
    void this.deps.api.actOnOrderCall(call.orderId, call.id, action).catch(() => undefined);
  }

  private finish(reason: CallEndReason, problem: CallProblem | null = null, incoming: OrderCall | null = null): void {
    if (this.finished) return;
    this.finished = true;
    this.release();
    const connectedAt = this.snapshot.connectedAt;
    this.update({
      phase: "ended",
      ending: {
        reason,
        durationMs: connectedAt != null ? this.now() - connectedAt : null,
        problem,
      },
    });
    if (incoming) this.onIncomingInstead?.(incoming);
  }

  /** Set by the store: a start refused because the rider was calling at that moment. */
  onIncomingInstead?: (call: OrderCall) => void;

  private release(): void {
    if (this.pollTimer) clearTimeout(this.pollTimer);
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.pollTimer = this.heartbeatTimer = this.reconnectTimer = null;
    try {
      this.peer?.close();
    } catch {
      // Already closed.
    }
    this.peer = null;
    for (const track of this.stream?.getTracks() ?? []) {
      try {
        track.stop();
      } catch {
        // Already stopped.
      }
    }
    this.stream = null;
    this.deps.audio.stopRinging();
    this.deps.audio.stopCall();
  }
}
