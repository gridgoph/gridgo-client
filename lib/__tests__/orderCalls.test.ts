import { pushTargetRoute, parsePushData } from "@/lib/push";
import {
  callPushOrder,
  callStartProblem,
  callWindowOpen,
  endCopy,
  endReasonFor,
  formatCallDuration,
  latestMissedCall,
  missedCallNotice,
  orderHasCalls,
  partyName,
  phaseLabel,
  readCall,
  readCalls,
  ringingIncoming,
  type OrderCall,
} from "@/lib/orderCalls";

const NOW = Date.parse("2026-10-08T08:00:10.000Z");

function call(overrides: Partial<OrderCall> = {}): OrderCall {
  return {
    id: "e115b493-dee1-448f-b6ba-a9868f448df2",
    orderId: "ord_example",
    pair: "delivery",
    state: "ringing",
    caller: { firstName: "Sam", role: "rider" },
    callee: { firstName: "Alex", role: "client" },
    mine: false,
    createdAt: "2026-10-08T08:00:00.000Z",
    ringExpiresAt: "2026-10-08T08:00:30.000Z",
    acceptedAt: null,
    endedAt: null,
    leaseExpiresAt: null,
    ...overrides,
  };
}

const apiError = (status: number, error: string) => ({ status, body: { error } });

describe("reading the call projection", () => {
  it("keeps only the allowlisted fields and never a number or address", () => {
    const read = readCall({ ...call(), phone: "+639171234567", caller: { firstName: "Sam", role: "rider", phone: "x" } });
    expect(read).toEqual(call());
    expect(JSON.stringify(read)).not.toContain("+63");
  });

  it("drops what is not a call and survives an unknown state", () => {
    expect(readCall(null)).toBeNull();
    expect(readCall({ id: "x" })).toBeNull();
    expect(readCalls([call(), { nope: true }, call({ id: "b", state: "on_hold" })]).map((c) => c.state)).toEqual([
      "ringing",
      "on_hold",
    ]);
  });

  it("names the other side, and falls back when the API has no clean first name", () => {
    expect(partyName(call())).toBe("Sam");
    expect(partyName(call({ mine: true }))).toBe("Alex");
    expect(partyName(readCall({ ...call(), caller: { role: "rider" } }))).toBe("Rider");
    expect(partyName(null)).toBe("Your rider");
  });
});

describe("which incoming call rings", () => {
  it("rings for the rider's call while it is still ringing", () => {
    expect(ringingIncoming([call()], NOW)?.id).toBe(call().id);
  });

  it("never rings again for a stale or duplicate push", () => {
    expect(ringingIncoming([call()], Date.parse("2026-10-08T08:00:31.000Z"))).toBeNull();
    expect(ringingIncoming([call({ state: "missed" })], NOW)).toBeNull();
    expect(ringingIncoming([call({ state: "accepted" })], NOW)).toBeNull();
  });

  it("never rings for the client's own outgoing call", () => {
    expect(ringingIncoming([call({ mine: true })], NOW)).toBeNull();
  });
});

describe("the missed-call notice", () => {
  it("shows the newest call when the rider's went unanswered or was cancelled", () => {
    expect(latestMissedCall([call({ state: "missed" })])?.state).toBe("missed");
    expect(latestMissedCall([call({ state: "cancelled" })])?.state).toBe("cancelled");
  });

  it("is answered by any later call, and is not a call the client declined", () => {
    const missed = call({ state: "missed" });
    const later = call({ id: "later", mine: true, state: "ended", createdAt: "2026-10-08T08:05:00.000Z" });
    expect(latestMissedCall([later, missed])).toBeNull();
    expect(latestMissedCall([call({ state: "declined" })])).toBeNull();
    expect(latestMissedCall([call({ state: "ended" })])).toBeNull();
    expect(latestMissedCall([])).toBeNull();
  });

  it("says who called, by first name", () => {
    const notice = missedCallNotice(call({ state: "missed", endedAt: "2026-10-08T08:00:30.000Z" }), NOW);
    expect(notice.title).toBe("Missed call from Sam");
    expect(notice.detail).toMatch(/^At 4:00/);
  });
});

describe("the calling window", () => {
  const order = (status?: string) => ({ deliveryChat: status ? { status, closesAt: null, retentionHours: 24 } : undefined });

  it("is open exactly while the delivery conversation is writable", () => {
    expect(callWindowOpen(order("open"))).toBe(true);
    expect(callWindowOpen(order("read_only"))).toBe(false);
    expect(callWindowOpen(order())).toBe(false);
    expect(callWindowOpen(null)).toBe(false);
  });

  it("still reads retained calls for a delivered order, and none for a pick-up", () => {
    expect(orderHasCalls(order("read_only"))).toBe(true);
    expect(orderHasCalls(order())).toBe(false);
  });
});

describe("call states and endings", () => {
  it("words every phase", () => {
    expect(phaseLabel("preparing")).toBe("Calling…");
    expect(phaseLabel("calling")).toBe("Calling…");
    expect(phaseLabel("ringing")).toBe("Ringing…");
    expect(phaseLabel("connecting")).toBe("Connecting…");
    expect(phaseLabel("reconnecting")).toBe("Reconnecting…");
    expect(phaseLabel("incoming")).toBe("Incoming call");
  });

  it("formats the timer", () => {
    expect(formatCallDuration(7_400)).toBe("0:07");
    expect(formatCallDuration(754_000)).toBe("12:34");
    expect(formatCallDuration(3_723_000)).toBe("1:02:03");
    expect(formatCallDuration(-5)).toBe("0:00");
  });

  it.each([
    [{ state: "declined", mine: true }, "declined"],
    [{ state: "missed", mine: true }, "no_answer"],
    [{ state: "missed", mine: false }, "missed"],
    [{ state: "cancelled", mine: false }, "missed"],
    [{ state: "ended", mine: true }, "ended"],
  ] as const)("says why %o ended: %s", (input, reason) => {
    expect(endReasonFor({ ...input, endedByMe: false, connectionLost: false })).toBe(reason);
  });

  it("tells a hang-up from a dropped connection", () => {
    expect(endReasonFor({ state: "ended", mine: true, endedByMe: true, connectionLost: false })).toBe("ended_by_you");
    expect(endReasonFor({ state: "ended", mine: true, endedByMe: false, connectionLost: true })).toBe("network_lost");
  });

  it("has a plain sentence for each ending, and offers to call again where it helps", () => {
    expect(endCopy("declined", "Sam", null)).toMatchObject({ title: "Sam declined", callAgain: true });
    expect(endCopy("no_answer", "Sam", null)).toMatchObject({ title: "No answer", callAgain: true });
    expect(endCopy("missed", "Sam", null)).toMatchObject({ title: "Missed call", callAgain: true });
    expect(endCopy("network_lost", "Sam", 5_000)).toMatchObject({ title: "Connection lost", icon: "wifi-off" });
    expect(endCopy("ended", "Sam", 65_000).detail).toBe("Sam ended the call · 1:05");
    expect(endCopy("unavailable", "Sam", null).callAgain).toBe(false);
  });

  it("words a refused start", () => {
    expect(callStartProblem(apiError(409, "call_not_available")).title).toBe("Calls are closed for this order");
    expect(callStartProblem(apiError(429, "too_many_requests")).body).toMatch(/send your rider a message/);
    expect(callStartProblem(new Error("Network request failed")).title).toBe("The call did not go through");
  });
});

describe("call pushes", () => {
  it("open the order, which is where the ring or the missed-call notice is drawn", () => {
    for (const type of ["order_call_incoming", "order_call_missed"]) {
      expect(pushTargetRoute(parsePushData({ type, orderId: "ord_example", notificationId: "n" }))).toBe(
        "/order/ord_example",
      );
    }
  });

  it("only an incoming-call push asks the phone to look for a ring", () => {
    expect(callPushOrder({ type: "order_call_incoming", orderId: "ord_example" })).toBe("ord_example");
    expect(callPushOrder({ type: "order_call_missed", orderId: "ord_example" })).toBeNull();
    expect(callPushOrder({ type: "order_call_incoming" })).toBeNull();
    expect(callPushOrder(null)).toBeNull();
  });
});
