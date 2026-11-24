import type { Notification } from "@/lib/api";
import { groupInbox, presentNotification } from "@/lib/notificationPresentation";
import { groupNotificationRoute, isGroupNotification, pushTargetRoute } from "@/lib/push";

function alert(overrides: Partial<Notification>): Notification {
  return {
    id: "ntf_1",
    userId: "u_b",
    type: "group_joined",
    groupId: "grp_1",
    title: "Group order",
    body: "You joined the group.",
    read: false,
    at: "2026-11-24T02:30:00.000Z",
    ...overrides,
  };
}

// gridgo-api#415: one card per group, from the first join, before any order exists.
describe("group alerts in the inbox", () => {
  it("folds a group's updates into one card, before and after its order", () => {
    const groups = groupInbox([
      alert({ id: "a", at: "2026-11-24T02:30:00.000Z" }),
      alert({ id: "b", type: "group_placed", orderId: "ord_1", at: "2026-11-24T02:40:00.000Z" }),
      alert({ id: "c", groupId: "grp_2", at: "2026-11-24T02:35:00.000Z" }),
    ]);
    expect(groups.map((group) => group.key)).toEqual(["group:grp_1", "group:grp_2"]);
    expect(groups[0].items.map((item) => item.id)).toEqual(["b", "a"]);
  });

  it("draws no GRIDGO Office stage and no payment ask on a pickup group", () => {
    const shown = presentNotification(
      alert({
        type: "group_shop_changed",
        orderId: "ord_1",
        orderState: "awaiting_collection",
        fulfillmentMode: "pickup",
        body: "The shop changed. The group price is unchanged.",
        paymentAction: { installment: "final_online", status: "due", amountMinor: 100 },
      }),
    );
    expect(shown.stageLabel).toBeNull();
    expect(shown.callout).toBeNull();
    expect(shown.lane).toBe("update");
    expect(shown.hint).toBe("Opens the group");
  });

  it("asks the host to choose when their shop changed", () => {
    const shown = presentNotification(
      alert({ type: "group_shop_changed", body: "The shop changed at the same price. Review the replacement within five minutes or it will be used." }),
    );
    expect(shown.lane).toBe("need_you");
  });

  it("says a cancel reason in words, never its code", () => {
    expect(presentNotification(alert({ type: "group_cancelled", body: "Group cancelled: no_shop_in_zone." })).body).toBe(
      "Group cancelled. No shop in the same area could take it, so GRIDGO cancelled it.",
    );
  });
});

describe("group push taps", () => {
  it("routes a group alert to its group, and a bare push to the inbox until it is read back", () => {
    expect(isGroupNotification("group_on_the_way")).toBe(true);
    expect(groupNotificationRoute({ type: "group_placed", groupId: "grp_1" })).toBe("/express/group/grp_1");
    expect(groupNotificationRoute({ type: "group_placed", groupId: null })).toBeNull();
    expect(groupNotificationRoute({ type: "order_update", groupId: "grp_1" })).toBeNull();
    expect(pushTargetRoute({ notificationId: "ntf_1", type: "group_placed", orderId: "ord_1", at: null })).toBe("/(tabs)/notifications");
  });
});
