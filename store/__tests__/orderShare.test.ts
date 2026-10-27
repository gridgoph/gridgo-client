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
  useOrderShare.setState({ pendingTaps: [] });
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

  it("lets the card close even when GRIDGO cannot be reached", async () => {
    jest.spyOn(api, "recordShareCard").mockRejectedValue(new TypeError("Network request failed"));
    await expect(useOrderShare.getState().recordCard(ORDER, "order_repeat", "maybe_later")).resolves.toBeUndefined();
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
    await useOrderShare.getState().flushTaps();

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
    await useOrderShare.getState().flushTaps();
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
