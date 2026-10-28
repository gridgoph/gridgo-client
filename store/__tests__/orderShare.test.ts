import * as api from "@/lib/api";
import { useOrderShare } from "@/store/orderShare";
import { useSession } from "@/store/session";
import { orderShare, shareRead } from "@/test/shareFixtures";

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const ORDER = "ord_refund_1";

beforeEach(() => {
  jest.restoreAllMocks();
  useSession.setState({ user: { id: "u1", email: "c@gridgo.local", name: "Ana Cruz", role: "client" } });
  useOrderShare.getState().reset();
  useOrderShare.setState({ pendingTaps: [], pendingCards: [] });
});

describe("share card store", () => {
  it("records Maybe later and holds the repeat for a later visit", async () => {
    const dismissed = orderShare({}, { showAfterSurvey: false, firstShownAt: "t", dismissedAt: "t", showFromOrder: true });
    const record = jest.spyOn(api, "recordShareCard").mockResolvedValue(shareRead(dismissed));

    await useOrderShare.getState().recordCard(ORDER, "after_survey", "maybe_later");

    expect(record).toHaveBeenCalledWith(ORDER, "after_survey", "maybe_later");
    expect(useOrderShare.getState().putOff[ORDER]).toBe(true);
    expect(useOrderShare.getState().shares[ORDER].card.showFromOrder).toBe(true);
  });

  it("keeps a newer answer when an older read lands after it", async () => {
    const prepared = orderShare();
    const unprepared = orderShare({ inviteCode: null, inviteLink: null });
    let olderRead: (read: api.OrderShareRead) => void = () => undefined;
    jest.spyOn(api, "getOrderShare").mockReturnValue(new Promise((resolve) => (olderRead = resolve)));
    jest.spyOn(api, "prepareOrderShare").mockResolvedValue(shareRead(prepared));

    const older = useOrderShare.getState().load(ORDER);
    await useOrderShare.getState().prepare(ORDER);
    olderRead(shareRead(unprepared));
    await older;

    expect(useOrderShare.getState().shares[ORDER].inviteCode).toBe(prepared.inviteCode);
    expect(useOrderShare.getState().status[ORDER]).toBe("ready");
  });

  it("lets the card close even when GRIDGO cannot be reached", async () => {
    jest.spyOn(api, "recordShareCard").mockRejectedValue(new TypeError("Network request failed"));
    await expect(useOrderShare.getState().recordCard(ORDER, "order_repeat", "maybe_later")).resolves.toBeUndefined();
  });

  it("never sends Maybe later before its shown has been answered", async () => {
    const calls: string[] = [];
    let answerShown: () => void = () => undefined;
    jest.spyOn(api, "recordShareCard").mockImplementation(async (_order, presentation, action) => {
      calls.push(`${presentation}:${action}:start`);
      if (action === "shown") await new Promise<void>((resolve) => (answerShown = resolve));
      calls.push(`${presentation}:${action}:end`);
      return shareRead(orderShare());
    });

    const shown = useOrderShare.getState().recordCard(ORDER, "after_survey", "shown");
    const later = useOrderShare.getState().recordCard(ORDER, "after_survey", "maybe_later");
    await Promise.resolve();
    await Promise.resolve();
    expect(calls).toEqual(["after_survey:shown:start"]);

    answerShown();
    await Promise.all([shown, later]);
    expect(calls).toEqual([
      "after_survey:shown:start",
      "after_survey:shown:end",
      "after_survey:maybe_later:start",
      "after_survey:maybe_later:end",
    ]);
    expect(useOrderShare.getState().pendingCards).toEqual([]);
  });

  it("keeps card events the network lost, in order, and resends them on the next flush", async () => {
    const record = jest.spyOn(api, "recordShareCard").mockRejectedValue(new TypeError("Network request failed"));
    await useOrderShare.getState().recordCard(ORDER, "after_survey", "shown");
    await useOrderShare.getState().recordCard(ORDER, "after_survey", "maybe_later");
    expect(useOrderShare.getState().pendingCards.map((event) => event.action)).toEqual(["shown", "maybe_later"]);

    record.mockReset().mockResolvedValue(shareRead(orderShare()));
    await useOrderShare.getState().flush();

    expect(record.mock.calls).toEqual([
      [ORDER, "after_survey", "shown"],
      [ORDER, "after_survey", "maybe_later"],
    ]);
    expect(useOrderShare.getState().pendingCards).toEqual([]);
  });

  it("drops a card event GRIDGO refused for good and carries on with the next", async () => {
    const record = jest
      .spyOn(api, "recordShareCard")
      .mockRejectedValueOnce(new api.ApiError(409, { error: "share_card_not_available" }))
      .mockResolvedValue(shareRead(orderShare()));
    await useOrderShare.getState().recordCard(ORDER, "after_survey", "shown");
    await useOrderShare.getState().recordCard("ord_other", "after_survey", "shown");
    expect(record).toHaveBeenCalledTimes(2);
    expect(useOrderShare.getState().pendingCards).toEqual([]);
  });

  it("holds the repeat while a repeat this phone showed is unconfirmed, across a restart", async () => {
    jest.spyOn(api, "recordShareCard").mockRejectedValue(new TypeError("Network request failed"));
    await useOrderShare.getState().recordCard(ORDER, "order_repeat", "shown");
    expect(useOrderShare.getState().repeatUnconfirmed(ORDER)).toBe(true);
    expect(useOrderShare.getState().repeatUnconfirmed("ord_other")).toBe(false);
    // Persisted with the taps, so a cold start still knows.
    const persisted = useOrderShare.persist.getOptions().partialize?.(useOrderShare.getState()) as {
      pendingCards: unknown[];
    };
    expect(persisted.pendingCards).toHaveLength(1);
  });

  it("suppresses the repeat for one visit after Maybe later, not for the rest of the session", async () => {
    jest.spyOn(api, "recordShareCard").mockResolvedValue(shareRead(orderShare()));
    await useOrderShare.getState().recordCard(ORDER, "after_survey", "maybe_later");
    expect(useOrderShare.getState().takePutOff(ORDER)).toBe(true);
    expect(useOrderShare.getState().takePutOff(ORDER)).toBe(false);
  });

  it("counts a tap once, with a fresh UUID v4 per tap", async () => {
    const tap = jest
      .spyOn(api, "recordShareTap")
      .mockImplementation(async (_order, eventId) => ({ ...shareRead(orderShare()), eventId, recorded: true, replay: false }));

    await useOrderShare.getState().tap(ORDER, "share");
    await useOrderShare.getState().tap(ORDER, "send_to_friend");

    expect(tap).toHaveBeenCalledTimes(2);
    const [first, second] = tap.mock.calls;
    expect(first[0]).toBe(ORDER);
    expect(first[1]).toMatch(UUID_V4);
    expect(first[2]).toBe("share");
    expect(second[2]).toBe("send_to_friend");
    expect(second[1]).not.toBe(first[1]);
    expect(useOrderShare.getState().pendingTaps).toEqual([]);
  });

  it("keeps a tap the network lost and resends it with the same ID", async () => {
    const tap = jest.spyOn(api, "recordShareTap").mockRejectedValueOnce(new TypeError("Network request failed"));
    await useOrderShare.getState().tap(ORDER, "share");
    const [pending] = useOrderShare.getState().pendingTaps;
    expect(pending).toMatchObject({ orderId: ORDER, action: "share", ownerId: "u1" });

    tap.mockImplementationOnce(async (_order, eventId) => ({ ...shareRead(orderShare()), eventId, recorded: true, replay: true }));
    await useOrderShare.getState().flush();

    expect(tap).toHaveBeenLastCalledWith(ORDER, pending.eventId, "share");
    expect(useOrderShare.getState().pendingTaps).toEqual([]);
  });

  it("drops a tap GRIDGO refused for good", async () => {
    jest.spyOn(api, "recordShareTap").mockRejectedValue(new api.ApiError(409, { error: "share_tap_conflict" }));
    await useOrderShare.getState().tap(ORDER, "share");
    expect(useOrderShare.getState().pendingTaps).toEqual([]);
  });

  it("resends only the signed-in account's taps", async () => {
    const tap = jest.spyOn(api, "recordShareTap");
    useOrderShare.setState({
      pendingTaps: [{ ownerId: "someone_else", orderId: ORDER, eventId: "5daf3673-c956-4b5d-b187-9051767a445b", action: "share" }],
    });
    await useOrderShare.getState().flush();
    expect(tap).not.toHaveBeenCalled();
  });

  it("holds other moments while the after-survey card is decided, and lets go", () => {
    const store = useOrderShare.getState();
    store.holdForSurvey(ORDER);
    expect(useOrderShare.getState().hold).toBe(ORDER);
    store.setPresenting({ orderId: ORDER, presentation: "after_survey" });
    expect(useOrderShare.getState().hold).toBeNull();
    store.setPresenting(null);
    store.holdForSurvey(ORDER);
    store.release(ORDER);
    expect(useOrderShare.getState().hold).toBeNull();
  });
});
