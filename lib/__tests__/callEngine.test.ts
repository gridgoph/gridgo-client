import { CallEngine, RECONNECT_GRACE_MS, type CallApi, type CallSnapshot } from "@/lib/callEngine";
import type { CallAudio, CallMedia, CallPeer, CallTrack } from "@/lib/callMedia";
import { CALL_HEARTBEAT_MS, CALL_POLL_MS, type OrderCall } from "@/lib/orderCalls";

const ORDER = "ord_example";
const ID = "e115b493-dee1-448f-b6ba-a9868f448df2";

function call(overrides: Partial<OrderCall> = {}): OrderCall {
  return {
    id: ID,
    orderId: ORDER,
    pair: "delivery",
    state: "ringing",
    caller: { firstName: "Alex", role: "client" },
    callee: { firstName: "Sam", role: "rider" },
    mine: true,
    createdAt: new Date(Date.now()).toISOString(),
    ringExpiresAt: new Date(Date.now() + 30_000).toISOString(),
    acceptedAt: null,
    endedAt: null,
    leaseExpiresAt: null,
    ...overrides,
  };
}

class FakePeer {
  listeners: Record<string, ((event: unknown) => void)[]> = {};
  iceConnectionState = "new";
  connectionState = "new";
  closed = false;
  tracks: CallTrack[] = [];
  remote: unknown[] = [];
  candidates: unknown[] = [];
  addTrack = (track: CallTrack) => this.tracks.push(track);
  createOffer = jest.fn(async () => ({ type: "offer", sdp: "v=0 offer" }));
  createAnswer = jest.fn(async () => ({ type: "answer", sdp: "v=0 answer" }));
  setLocalDescription = jest.fn(async () => undefined);
  setRemoteDescription = jest.fn(async (description: unknown) => {
    this.remote.push(description);
  });
  addIceCandidate = jest.fn(async (candidate: unknown) => {
    this.candidates.push(candidate);
  });
  addEventListener = (type: string, listener: (event: never) => void) => {
    (this.listeners[type] ??= []).push(listener as (event: unknown) => void);
  };
  close = () => {
    this.closed = true;
  };
  emit(type: string, event: unknown = {}) {
    for (const listener of this.listeners[type] ?? []) listener(event);
  }
  ice(state: string) {
    this.iceConnectionState = state;
    this.emit("iceconnectionstatechange");
  }
}

function setup(overrides: Partial<CallApi> = {}) {
  const peers: FakePeer[] = [];
  const track = { enabled: true, stop: jest.fn() };
  const media: CallMedia = {
    createPeer: () => {
      const peer = new FakePeer();
      peers.push(peer);
      return peer as unknown as CallPeer;
    },
    description: (init) => init,
    candidate: (init) => init,
    microphone: jest.fn(async () => ({ getTracks: () => [track], getAudioTracks: () => [track] })),
  };
  const audio: jest.Mocked<CallAudio> = {
    startRinging: jest.fn(),
    stopRinging: jest.fn(),
    startCall: jest.fn(),
    stopRingback: jest.fn(),
    setSpeaker: jest.fn(),
    stopCall: jest.fn(),
  };
  const api: jest.Mocked<CallApi> = {
    startOrderCall: jest.fn(async () => call()),
    listOrderCalls: jest.fn(async () => []),
    getOrderCall: jest.fn(async () => call()),
    actOnOrderCall: jest.fn(async (_o, _c, action) =>
      call({ state: action === "accept" || action === "heartbeat" ? "accepted" : action === "end" ? "ended" : action === "decline" ? "declined" : "cancelled" }),
    ),
    getOrderCallIce: jest.fn(async () => ({ iceServers: [{ urls: "stun:stun.example.test:3478" }], expiresAt: null, relayAvailable: false })),
    sendOrderCallSignal: jest.fn(async () => ({ id: 1 })),
    listOrderCallSignals: jest.fn(async () => ({ signals: [], cursor: 0, call: call() })),
    ...overrides,
  } as jest.Mocked<CallApi>;
  const snapshots: CallSnapshot[] = [];
  const make = (direction: "outgoing" | "incoming") =>
    new CallEngine(ORDER, direction, { api, media, audio }, (snapshot) => snapshots.push(snapshot));
  return { api, media, audio, peers, track, snapshots, make, phases: () => snapshots.map((s) => s.phase) };
}

beforeEach(() => {
  jest.useFakeTimers({ now: Date.parse("2026-10-08T08:00:00.000Z") });
});
afterEach(() => {
  jest.useRealTimers();
});

describe("an outgoing call", () => {
  it("goes calling → ringing → connecting → connected, offering audio only", async () => {
    const t = setup();
    const engine = t.make("outgoing");
    expect(engine.state.phase).toBe("preparing");
    await engine.place();
    expect(t.api.startOrderCall).toHaveBeenCalledWith(ORDER);
    expect(t.audio.startCall).toHaveBeenCalledWith(true);
    expect(engine.state.phase).toBe("ringing");
    expect(engine.state.peerName).toBe("Sam");
    expect(t.peers[0]!.createOffer).toHaveBeenCalledWith({ offerToReceiveAudio: true, offerToReceiveVideo: false });
    expect(t.api.sendOrderCallSignal).toHaveBeenCalledWith(ORDER, ID, { clientId: "offer_1", kind: "offer", sdp: "v=0 offer" });

    // The rider answers.
    t.api.listOrderCallSignals.mockResolvedValueOnce({
      signals: [
        { id: 4, kind: "ice", candidate: "candidate:1 1 UDP 1 192.0.2.1 1234 typ host", sdpMid: "0", sdpMLineIndex: 0 },
        { id: 5, kind: "answer", sdp: "v=0 answer" },
      ],
      cursor: 5,
      call: call({ state: "accepted", acceptedAt: new Date().toISOString() }),
    });
    await jest.advanceTimersByTimeAsync(0);
    expect(engine.state.phase).toBe("connecting");
    expect(t.audio.stopRingback).toHaveBeenCalled();
    // Remote ICE waited for the answer, then went in.
    expect(t.peers[0]!.remote).toEqual([{ type: "answer", sdp: "v=0 answer" }]);
    expect(t.peers[0]!.candidates).toHaveLength(1);

    t.peers[0]!.ice("connected");
    expect(engine.state.phase).toBe("connected");
    expect(engine.state.connectedAt).toBe(Date.now());

    // The next poll asks from the returned cursor.
    await jest.advanceTimersByTimeAsync(CALL_POLL_MS);
    expect(t.api.listOrderCallSignals).toHaveBeenLastCalledWith(ORDER, ID, 5);
    engine.dispose();
  });

  it("trickles its own ICE candidates as signals", async () => {
    const t = setup();
    const engine = t.make("outgoing");
    await engine.place();
    t.peers[0]!.emit("icecandidate", { candidate: { candidate: "candidate:2 1 UDP 2 192.0.2.2 9 typ host", sdpMid: "0", sdpMLineIndex: 0 } });
    t.peers[0]!.emit("icecandidate", { candidate: null });
    await jest.advanceTimersByTimeAsync(0);
    expect(t.api.sendOrderCallSignal).toHaveBeenCalledWith(ORDER, ID, {
      clientId: "ice_1",
      kind: "ice",
      candidate: "candidate:2 1 UDP 2 192.0.2.2 9 typ host",
      sdpMid: "0",
      sdpMLineIndex: 0,
    });
    expect(t.api.sendOrderCallSignal).toHaveBeenCalledTimes(2);
    engine.dispose();
  });

  it("says the rider declined, and stops the microphone", async () => {
    const t = setup();
    const engine = t.make("outgoing");
    await engine.place();
    t.api.listOrderCallSignals.mockResolvedValueOnce({ signals: [], cursor: 0, call: call({ state: "declined" }) });
    await jest.advanceTimersByTimeAsync(0);
    expect(engine.state.phase).toBe("ended");
    expect(engine.state.ending?.reason).toBe("declined");
    expect(t.track.stop).toHaveBeenCalled();
    expect(t.peers[0]!.closed).toBe(true);
    expect(t.audio.stopCall).toHaveBeenCalled();
  });

  it("says nobody answered when the ring runs out", async () => {
    const t = setup();
    const engine = t.make("outgoing");
    await engine.place();
    t.api.listOrderCallSignals.mockResolvedValueOnce({ signals: [], cursor: 0, call: call({ state: "missed" }) });
    await jest.advanceTimersByTimeAsync(0);
    expect(engine.state.ending?.reason).toBe("no_answer");
  });

  it("cancels a call still ringing when the client hangs up", async () => {
    const t = setup();
    const engine = t.make("outgoing");
    await engine.place();
    await engine.hangUp();
    expect(t.api.actOnOrderCall).toHaveBeenCalledWith(ORDER, ID, "cancel");
    expect(engine.state.ending?.reason).toBe("ended_by_you");
  });

  it("ends an answered call instead when the cancel crossed the answer", async () => {
    const t = setup();
    t.api.actOnOrderCall.mockRejectedValueOnce({ status: 409, body: { error: "invalid_call_transition" } });
    const engine = t.make("outgoing");
    await engine.place();
    await engine.hangUp();
    expect(t.api.actOnOrderCall).toHaveBeenLastCalledWith(ORDER, ID, "end");
  });

  it("explains a refused start and never rings", async () => {
    const t = setup({
      startOrderCall: jest.fn(async () => {
        throw { status: 409, body: { error: "call_not_available" } };
      }),
    });
    const engine = t.make("outgoing");
    await engine.place();
    expect(engine.state.phase).toBe("ended");
    expect(engine.state.ending?.problem?.title).toBe("Calls are closed for this order");
    expect(t.audio.startCall).not.toHaveBeenCalled();
    expect(t.track.stop).toHaveBeenCalled();
  });

  it("recovers its own live call after a lost start response instead of starting another", async () => {
    const t = setup({
      startOrderCall: jest.fn(async () => {
        throw { status: 409, body: { error: "call_already_active" } };
      }),
      listOrderCalls: jest.fn(async () => [call()]),
    });
    const engine = t.make("outgoing");
    await engine.place();
    expect(engine.state.phase).toBe("ringing");
    expect(engine.callId).toBe(ID);
    engine.dispose();
  });

  it("hands over to the rider's ring when both called at once", async () => {
    const incoming = call({ id: "f115b493-dee1-448f-b6ba-a9868f448df2", mine: false, caller: { firstName: "Sam", role: "rider" } });
    const t = setup({
      startOrderCall: jest.fn(async () => {
        throw { status: 409, body: { error: "call_already_active" } };
      }),
      listOrderCalls: jest.fn(async () => [incoming]),
    });
    const engine = t.make("outgoing");
    const handover = jest.fn();
    engine.onIncomingInstead = handover;
    await engine.place();
    expect(handover).toHaveBeenCalledWith(incoming);
  });
});

describe("a call that is talking", () => {
  async function connected() {
    const t = setup();
    const engine = t.make("outgoing");
    await engine.place();
    t.api.listOrderCallSignals.mockResolvedValue({
      signals: [],
      cursor: 0,
      call: call({ state: "accepted", leaseExpiresAt: new Date(Date.now() + 90_000).toISOString() }),
    });
    await jest.advanceTimersByTimeAsync(0);
    t.peers[0]!.ice("connected");
    return { ...t, engine };
  }

  it("renews its lease every 20 seconds", async () => {
    const { engine, api } = await connected();
    await jest.advanceTimersByTimeAsync(CALL_HEARTBEAT_MS);
    expect(api.actOnOrderCall).toHaveBeenCalledWith(ORDER, ID, "heartbeat");
    engine.dispose();
  });

  it("mutes the microphone track and routes to the speaker", async () => {
    const { engine, track, audio } = await connected();
    engine.setMuted(true);
    expect(track.enabled).toBe(false);
    expect(engine.state.muted).toBe(true);
    engine.setSpeaker(true);
    expect(audio.setSpeaker).toHaveBeenCalledWith(true);
    expect(engine.state.speaker).toBe(true);
    engine.dispose();
  });

  it("shows Reconnecting… on a dropped path and recovers when it comes back", async () => {
    const { engine, peers } = await connected();
    peers[0]!.ice("disconnected");
    expect(engine.state.phase).toBe("reconnecting");
    peers[0]!.ice("connected");
    expect(engine.state.phase).toBe("connected");
    engine.dispose();
  });

  it("gives up and says the connection was lost when the path does not come back", async () => {
    const { engine, peers, api } = await connected();
    peers[0]!.ice("disconnected");
    await jest.advanceTimersByTimeAsync(RECONNECT_GRACE_MS);
    expect(engine.state.ending?.reason).toBe("network_lost");
    expect(api.actOnOrderCall).toHaveBeenCalledWith(ORDER, ID, "end");
  });

  it("fails closed once its lease has passed without reaching GRIDGO", async () => {
    const { engine, api, track } = await connected();
    api.listOrderCallSignals.mockRejectedValue(new Error("Network request failed"));
    api.actOnOrderCall.mockRejectedValue(new Error("Network request failed"));
    await jest.advanceTimersByTimeAsync(95_000);
    expect(engine.state.ending?.reason).toBe("network_lost");
    expect(track.stop).toHaveBeenCalled();
  });

  it("says the rider ended it, with the talk time", async () => {
    const { engine, api } = await connected();
    await jest.advanceTimersByTimeAsync(1_000);
    api.listOrderCallSignals.mockResolvedValueOnce({ signals: [], cursor: 0, call: call({ state: "ended" }) });
    await jest.advanceTimersByTimeAsync(CALL_POLL_MS);
    expect(engine.state.ending?.reason).toBe("ended");
    expect(engine.state.ending?.durationMs).toBeGreaterThanOrEqual(1_000);
  });
});

describe("an incoming call", () => {
  const incoming = () => call({ mine: false, caller: { firstName: "Sam", role: "rider" }, callee: { firstName: "Alex", role: "client" } });

  it("rings, then answers the rider's offer once accepted", async () => {
    const t = setup({ getOrderCall: jest.fn(async () => incoming()) });
    const engine = t.make("incoming");
    engine.ring(incoming());
    expect(engine.state.phase).toBe("incoming");
    expect(engine.state.peerName).toBe("Sam");
    expect(t.audio.startRinging).toHaveBeenCalled();

    t.api.listOrderCallSignals.mockResolvedValueOnce({
      signals: [
        { id: 1, kind: "ice", candidate: "candidate:1 1 UDP 1 192.0.2.1 1234 typ host", sdpMid: "0", sdpMLineIndex: 0 },
        { id: 2, kind: "offer", sdp: "v=0 offer" },
      ],
      cursor: 2,
      call: { ...incoming(), state: "accepted" },
    });
    await engine.accept();
    expect(t.audio.stopRinging).toHaveBeenCalled();
    expect(t.api.actOnOrderCall).toHaveBeenCalledWith(ORDER, ID, "accept");
    await jest.advanceTimersByTimeAsync(0);
    expect(t.peers[0]!.remote).toEqual([{ type: "offer", sdp: "v=0 offer" }]);
    expect(t.peers[0]!.candidates).toHaveLength(1);
    expect(t.api.sendOrderCallSignal).toHaveBeenCalledWith(ORDER, ID, { clientId: "answer_1", kind: "answer", sdp: "v=0 answer" });
    expect(engine.state.phase).toBe("connecting");
    engine.dispose();
  });

  it("stops ringing when the rider gives up first, as a missed call", async () => {
    const t = setup({ getOrderCall: jest.fn(async () => ({ ...incoming(), state: "cancelled" })) });
    const engine = t.make("incoming");
    engine.ring(incoming());
    await jest.advanceTimersByTimeAsync(CALL_POLL_MS);
    expect(engine.state.ending?.reason).toBe("missed");
    expect(t.audio.stopRinging).toHaveBeenCalled();
  });

  it("declines", async () => {
    const t = setup();
    const engine = t.make("incoming");
    engine.ring(incoming());
    await engine.decline();
    expect(t.api.actOnOrderCall).toHaveBeenCalledWith(ORDER, ID, "decline");
    expect(engine.state.phase).toBe("ended");
  });

  it("says it was missed when Accept lands after the ring ran out", async () => {
    const t = setup({
      getOrderCall: jest.fn(async () => ({ ...incoming(), state: "missed" })),
    });
    t.api.actOnOrderCall.mockRejectedValueOnce({ status: 409, body: { error: "invalid_call_transition" } });
    const engine = t.make("incoming");
    engine.ring(incoming());
    await engine.accept();
    expect(engine.state.ending?.reason).toBe("missed");
    expect(t.track.stop).toHaveBeenCalled();
  });
});
