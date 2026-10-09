import type { CallApi } from "@/lib/callEngine";
import type { CallAudio, CallMedia, CallPeer } from "@/lib/callMedia";
import type { OrderCall } from "@/lib/orderCalls";

const mockMedia = {
  readMicPermission: jest.fn(async () => "granted"),
  requestMicPermission: jest.fn(async () => "granted"),
  loadCallMedia: jest.fn((): CallMedia | null => null),
};
jest.mock("@/lib/callMedia", () => ({
  readMicPermission: () => mockMedia.readMicPermission(),
  requestMicPermission: () => mockMedia.requestMicPermission(),
  loadCallMedia: () => mockMedia.loadCallMedia(),
  loadCallAudio: () => ({}),
}));

jest.mock("@/lib/api", () => ({
  listOrderCalls: jest.fn(async () => []),
  listOrders: jest.fn(async () => []),
  actOnOrderCall: jest.fn(async () => ({})),
}));

import * as api from "@/lib/api";
import { setCallDepsForTests, useCall } from "@/store/call";

const ORDER = "ord_example";

function call(overrides: Partial<OrderCall> = {}): OrderCall {
  return {
    id: "e115b493-dee1-448f-b6ba-a9868f448df2",
    orderId: ORDER,
    pair: "delivery",
    state: "ringing",
    caller: { firstName: "Sam", role: "rider" },
    callee: { firstName: "Alex", role: "client" },
    mine: false,
    createdAt: new Date().toISOString(),
    ringExpiresAt: new Date(Date.now() + 30_000).toISOString(),
    acceptedAt: null,
    endedAt: null,
    leaseExpiresAt: null,
    ...overrides,
  };
}

const peer = {
  addTrack: jest.fn(),
  createOffer: jest.fn(async () => ({ type: "offer", sdp: "v=0" })),
  createAnswer: jest.fn(async () => ({ type: "answer", sdp: "v=0" })),
  setLocalDescription: jest.fn(async () => undefined),
  setRemoteDescription: jest.fn(async () => undefined),
  addIceCandidate: jest.fn(async () => undefined),
  addEventListener: jest.fn(),
  close: jest.fn(),
} as unknown as CallPeer;
const media: CallMedia = {
  createPeer: () => peer,
  description: (init) => init,
  candidate: (init) => init,
  microphone: async () => ({ getTracks: () => [], getAudioTracks: () => [] }),
};
const audio: CallAudio = {
  startRinging: jest.fn(),
  stopRinging: jest.fn(),
  startCall: jest.fn(),
  stopRingback: jest.fn(),
  setSpeaker: jest.fn(),
  stopCall: jest.fn(),
};
const engineApi = {
  startOrderCall: jest.fn(async () => call({ mine: true })),
  listOrderCalls: jest.fn(async () => []),
  getOrderCall: jest.fn(async () => call()),
  actOnOrderCall: jest.fn(async () => call()),
  getOrderCallIce: jest.fn(async () => ({ iceServers: [], expiresAt: null, relayAvailable: false })),
  sendOrderCallSignal: jest.fn(async () => ({ id: 1 })),
  listOrderCallSignals: jest.fn(async () => ({ signals: [], cursor: 0, call: call({ mine: true }) })),
} as unknown as CallApi;

function supported() {
  mockMedia.loadCallMedia.mockReturnValue(media);
  setCallDepsForTests({ api: engineApi, media, audio });
}

beforeEach(() => {
  useCall.getState().reset();
  setCallDepsForTests(null);
  mockMedia.loadCallMedia.mockReturnValue(null);
  mockMedia.readMicPermission.mockResolvedValue("granted");
  mockMedia.requestMicPermission.mockResolvedValue("granted");
  jest.clearAllMocks();
});

afterAll(() => useCall.getState().reset());

describe("a build without the calling module (Expo Go)", () => {
  it("explains instead of crashing when the client taps Call", async () => {
    await useCall.getState().startCall(ORDER);
    expect(useCall.getState().prompt).toEqual({ kind: "unsupported" });
    expect(useCall.getState().session).toBeNull();
    expect(mockMedia.readMicPermission).not.toHaveBeenCalled();
  });

  it("explains once when the rider calls, and does not ring", async () => {
    jest.mocked(api.listOrderCalls).mockResolvedValue([call()]);
    await useCall.getState().refreshOrderCalls(ORDER);
    expect(useCall.getState().prompt).toEqual({ kind: "unsupported" });
    useCall.getState().closePrompt();
    await useCall.getState().refreshOrderCalls(ORDER);
    expect(useCall.getState().prompt).toBeNull();
    expect(useCall.getState().session).toBeNull();
  });
});

describe("the microphone, asked at the first call", () => {
  it("explains first, then asks the phone, then rings the rider", async () => {
    supported();
    mockMedia.readMicPermission.mockResolvedValue("undetermined");
    await useCall.getState().startCall(ORDER);
    expect(useCall.getState().prompt).toEqual({ kind: "mic-explainer", orderId: ORDER });
    expect(engineApi.startOrderCall).not.toHaveBeenCalled();

    await useCall.getState().confirmMic();
    expect(mockMedia.requestMicPermission).toHaveBeenCalled();
    expect(useCall.getState().session?.direction).toBe("outgoing");
    await Promise.resolve();
    expect(engineApi.startOrderCall).toHaveBeenCalledWith(ORDER);
  });

  it("never rings the rider when the microphone is refused", async () => {
    supported();
    mockMedia.readMicPermission.mockResolvedValue("undetermined");
    mockMedia.requestMicPermission.mockResolvedValue("blocked");
    await useCall.getState().startCall(ORDER);
    await useCall.getState().confirmMic();
    expect(useCall.getState().prompt).toEqual({ kind: "mic-blocked" });
    expect(useCall.getState().session).toBeNull();
    expect(engineApi.startOrderCall).not.toHaveBeenCalled();
  });

  it("goes straight to settings once the phone will not ask again", async () => {
    supported();
    mockMedia.readMicPermission.mockResolvedValue("blocked");
    await useCall.getState().startCall(ORDER);
    expect(useCall.getState().prompt).toEqual({ kind: "mic-blocked" });
  });

  it("keeps an incoming call ringing when Accept is refused the microphone", async () => {
    supported();
    jest.mocked(api.listOrderCalls).mockResolvedValue([call()]);
    await useCall.getState().refreshOrderCalls(ORDER);
    mockMedia.readMicPermission.mockResolvedValue("undetermined");
    mockMedia.requestMicPermission.mockResolvedValue("blocked");
    await useCall.getState().accept();
    expect(useCall.getState().micRefused).toBe(true);
    expect(useCall.getState().session?.phase).toBe("incoming");
    expect(engineApi.actOnOrderCall).not.toHaveBeenCalled();
  });
});

describe("incoming calls", () => {
  it("ring full screen for the rider's live call", async () => {
    supported();
    jest.mocked(api.listOrderCalls).mockResolvedValue([call()]);
    await useCall.getState().refreshOrderCalls(ORDER);
    const { session, expanded } = useCall.getState();
    expect(session?.phase).toBe("incoming");
    expect(session?.peerName).toBe("Sam");
    expect(expanded).toBe(true);
    expect(audio.startRinging).toHaveBeenCalled();
  });

  it("do not ring for a stale call a late push points at", async () => {
    supported();
    jest.mocked(api.listOrderCalls).mockResolvedValue([call({ state: "missed" })]);
    useCall.getState().checkOrder(ORDER);
    await new Promise((resolve) => setImmediate(resolve));
    expect(useCall.getState().session).toBeNull();
    expect(useCall.getState().callsByOrder[ORDER]).toHaveLength(1);
  });

  it("decline a second call while one is already ringing or talking", async () => {
    supported();
    jest.mocked(api.listOrderCalls).mockResolvedValueOnce([call()]);
    await useCall.getState().refreshOrderCalls(ORDER);
    const other = call({ id: "f115b493-dee1-448f-b6ba-a9868f448df2", orderId: "ord_other" });
    jest.mocked(api.listOrderCalls).mockResolvedValueOnce([other]);
    await useCall.getState().refreshOrderCalls("ord_other");
    expect(api.actOnOrderCall).toHaveBeenCalledWith("ord_other", other.id, "decline");
    expect(useCall.getState().session?.orderId).toBe(ORDER);
  });

  it("are looked for on every order in a calling window", async () => {
    supported();
    jest.mocked(api.listOrders).mockResolvedValue([
      { id: ORDER, deliveryChat: { status: "open", closesAt: null, retentionHours: 24 } },
      { id: "ord_done", deliveryChat: { status: "read_only", closesAt: null, retentionHours: 24 } },
      { id: "ord_pickup" },
    ] as never);
    await useCall.getState().sweepIncoming();
    expect(api.listOrderCalls).toHaveBeenCalledTimes(1);
    expect(api.listOrderCalls).toHaveBeenCalledWith(ORDER);
  });
});

describe("a sign-out", () => {
  it("drops the call and every read", async () => {
    supported();
    jest.mocked(api.listOrderCalls).mockResolvedValue([call()]);
    await useCall.getState().refreshOrderCalls(ORDER);
    useCall.getState().reset();
    expect(useCall.getState().session).toBeNull();
    expect(useCall.getState().callsByOrder).toEqual({});
    expect(audio.stopRinging).toHaveBeenCalled();
  });
});
