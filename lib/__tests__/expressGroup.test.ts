import {
  cancelReasonLine,
  clockTime,
  currentGroup,
  deliveryShareLine,
  firstName,
  groupErrorLine,
  groupFiles,
  groupNotificationCopy,
  groupPhase,
  initials,
  inviteLink,
  inviteMessage,
  isGroupNotification,
  isHost,
  riderPoint,
  shareView,
  timeLeft,
  timeShare,
  trackingIndex,
  trackingLine,
  trackingStops,
} from "@/lib/expressGroup";
import type { ExpressPrint } from "@/lib/express";
import { groupFixture } from "@/test/expressGroup";

const NOW = Date.parse("2026-11-24T02:00:00.000Z");

describe("group phase and roles", () => {
  it("maps GRIDGO's state to the five phases", () => {
    expect(groupPhase({ state: "open", tracking: null })).toBe("open");
    expect(groupPhase({ state: "checkout_open", tracking: null })).toBe("checkout");
    expect(groupPhase({ state: "cancelled", tracking: null })).toBe("cancelled");
    expect(groupPhase({ state: "completed", tracking: null })).toBe("completed");
    expect(groupPhase({ state: "ordered", tracking: null })).toBe("ordered");
    expect(groupPhase({ state: "something_new", tracking: null })).toBe("ordered");
  });

  it("knows the host by id only", () => {
    const group = groupFixture();
    expect(isHost(group, "u_host")).toBe(true);
    expect(isHost(group, "u_b")).toBe(false);
    expect(isHost(group, null)).toBe(false);
  });

  it("sends a person back to their open group before one in flight", () => {
    const ordered = groupFixture({ id: "g_ordered", state: "ordered" });
    const open = groupFixture({ id: "g_open", state: "open" });
    const done = groupFixture({ id: "g_done", state: "completed" });
    expect(currentGroup([done, ordered, open])?.id).toBe("g_open");
    expect(currentGroup([done])).toBeNull();
  });

  it("treats every group_* type as a group alert", () => {
    expect(isGroupNotification("group_joined")).toBe(true);
    expect(isGroupNotification("group_updates")).toBe(true);
    expect(isGroupNotification("order_update")).toBe(false);
    expect(isGroupNotification(null)).toBe(false);
  });
});

describe("countdown", () => {
  it("counts down in m:ss and h:mm:ss, and stops at zero", () => {
    expect(timeLeft("2026-11-24T02:12:04.000Z", NOW)).toBe("12:04");
    expect(timeLeft("2026-11-24T03:02:00.000Z", NOW)).toBe("1:02:00");
    expect(timeLeft("2026-11-24T01:59:00.000Z", NOW)).toBeNull();
    expect(timeLeft(null, NOW)).toBeNull();
  });

  it("gives the share of the time limit still left", () => {
    expect(timeShare("2026-11-24T01:30:00.000Z", "2026-11-24T02:30:00.000Z", NOW)).toBeCloseTo(0.5);
    expect(timeShare("2026-11-24T01:00:00.000Z", "2026-11-24T01:30:00.000Z", NOW)).toBe(0);
    expect(timeShare(null, "2026-11-24T02:30:00.000Z", NOW)).toBe(0);
  });

  it("says the closing time in Davao", () => {
    expect(clockTime("2026-11-24T02:45:00.000Z")).toMatch(/10:45/);
    expect(clockTime("not a date")).toBeNull();
  });
});

describe("names", () => {
  it("never shows an email as a name", () => {
    expect(firstName("Ana Cruz")).toBe("Ana");
    expect(firstName("someone@example.com")).toBe("Someone");
    expect(firstName("")).toBe("Someone");
    expect(initials("Ana Cruz")).toBe("AC");
    expect(initials("a@b.c")).toBe("?");
  });
});

describe("what each person owes", () => {
  it("is nothing without files, pages-only while GRIDGO cannot price, then the full share", () => {
    expect(shareView({ fileCount: 0, pageCount: 0, printSubtotalMinor: 0, deliveryShareMinor: 0, amountOwedMinor: 0 })).toEqual({ kind: "none" });
    expect(shareView({ fileCount: 1, pageCount: 4, printSubtotalMinor: null, deliveryShareMinor: null, amountOwedMinor: null })).toEqual({ kind: "pending", pages: 4 });
    expect(shareView({ fileCount: 1, pageCount: 3, printSubtotalMinor: 1305, deliveryShareMinor: 1300, amountOwedMinor: 2605 })).toEqual({
      kind: "priced",
      pages: 3,
      printsMinor: 1305,
      deliveryMinor: 1300,
      owedMinor: 2605,
    });
  });

  it("reads the delivery share from a member row, and the fare only when GRIDGO sent it", () => {
    expect(deliveryShareLine(groupFixture())).toEqual({ shareMinor: 1300, fareMinor: 2500 });
    // A member's own read carries no fare and no member list.
    const member = groupFixture({
      members: undefined,
      deliveryFeeMinor: undefined,
      me: { ...groupFixture().me, userId: "u_b", fileCount: 1, deliveryShareMinor: 1300 },
    });
    expect(deliveryShareLine(member)).toEqual({ shareMinor: 1300, fareMinor: null });
    expect(deliveryShareLine(groupFixture({ fulfillmentMode: "pickup" }))).toBeNull();
  });
});

describe("files sent to the group", () => {
  it("keeps only the fields the group route takes, and prints A3 as A4", () => {
    const print = {
      key: "k",
      fileId: "file_1",
      name: "notes.pdf",
      pages: 3,
      copies: 2,
      pageRange: "",
      paper: "a3",
      colour: "bw",
      sides: "single",
      layout: "fit",
      note: "  staple  ",
      acceptedWarnings: [],
    } as unknown as ExpressPrint;
    expect(groupFiles([print])).toEqual([
      { fileId: "file_1", copies: 2, paper: "a4", colour: "bw", sides: "single", layout: "fit", note: "staple", acceptedWarnings: [] },
    ]);
  });
});

describe("invite", () => {
  it("builds the app link from the app's own root", () => {
    expect(inviteLink("gridgoclient://", "tok_abc")).toBe("gridgoclient://express/group/join/tok_abc");
    expect(inviteLink("exp://192.168.1.5:8081/--", "tok")).toBe("exp://192.168.1.5:8081/--/express/group/join/tok");
  });

  it("says who, until when, and where to get the app", () => {
    const text = inviteMessage({
      hostName: "Ana Cruz",
      link: "gridgoclient://express/group/join/tok",
      closesAt: "2026-11-24T02:45:00.000Z",
      mode: "delivery",
      downloadUrl: "https://example.com/app.apk",
    });
    expect(text).toContain("Ana is printing with GRIDGO");
    expect(text).toMatch(/before 10:45/);
    expect(text).toContain("one delivery fee");
    expect(text).toContain("gridgoclient://express/group/join/tok");
    expect(text).toContain("Get it here first: https://example.com/app.apk");
    expect(inviteMessage({ hostName: "Ana", link: "l", closesAt: "x", mode: "pickup", downloadUrl: null })).not.toContain("Get it here");
  });
});

describe("plain words", () => {
  it("names every cancel reason", () => {
    expect(cancelReasonLine("not_paid")).toMatch(/did not pay in time/);
    expect(cancelReasonLine("host_cancelled")).toMatch(/host cancelled/);
    expect(cancelReasonLine("three_declines")).toMatch(/Three shops/);
    expect(cancelReasonLine("no_shop_in_zone")).toMatch(/same area/);
    expect(cancelReasonLine(null)).toBe("This group order was cancelled.");
  });

  it("maps refusals and leaves unknown codes to the caller", () => {
    expect(groupErrorLine("group_full")).toBe("This group is full.");
    expect(groupErrorLine("group_locked")).toMatch(/Files are locked/);
    expect(groupErrorLine("group_shop_decision_expired")).toMatch(/kept the new shop/);
    expect(groupErrorLine("something_else")).toBeNull();
  });
});

describe("shared tracking", () => {
  it("has six stops for delivery and five for pickup", () => {
    expect(trackingStops("delivery")).toHaveLength(6);
    expect(trackingStops("pickup")).toEqual(["Placed", "Accepted", "Printing", "Ready", "Picked up"]);
  });

  it("places the order on the stops from GRIDGO's status and order state", () => {
    expect(trackingIndex("sending", "initial_payment_review", "delivery")).toBe(0);
    expect(trackingIndex("accepted", "supplier_assigned", "delivery")).toBe(1);
    expect(trackingIndex("printing", "production", "delivery")).toBe(2);
    expect(trackingIndex("ready", "ready_for_dispatch", "delivery")).toBe(3);
    expect(trackingIndex("ready", "out_for_delivery", "delivery")).toBe(4);
    expect(trackingIndex("delivered", "delivered", "delivery")).toBe(5);
    expect(trackingIndex("picked_up", "delivered", "pickup")).toBe(4);
    expect(trackingIndex("cancelled", "cancelled", "pickup")).toBeNull();
  });

  it("tells the host and members different things only where they act differently", () => {
    expect(trackingLine(3, "pickup", true, "Ana")).toMatch(/Show your pickup code/);
    expect(trackingLine(3, "pickup", false, "Ana Cruz")).toBe("Ready. Ana is picking it up for everyone.");
    expect(trackingLine(4, "delivery", false, "Ana")).toBe("On the way to Ana.");
    expect(trackingLine(null, "delivery", false, "Ana")).toMatch(/cancelled/);
  });

  it("draws the rider only from a real ping", () => {
    expect(riderPoint({ ping: { lat: 7.1, lng: 125.6 } } as never)).toEqual({ lat: 7.1, lng: 125.6 });
    expect(riderPoint({ ping: null } as never)).toBeNull();
    expect(riderPoint(null)).toBeNull();
  });
});

describe("group alerts in the inbox", () => {
  it("says times and pesos the app's way", () => {
    const copy = groupNotificationCopy({ title: "", body: "Files close at 2026-11-24T02:45:00.000Z. You owe PHP 26.05." });
    expect(copy.title).toBe("Group order");
    expect(copy.body).toMatch(/Files close at 10:45/);
    expect(copy.body).toContain("₱26.05");
    expect(copy.hint).toBe("Opens the group");
  });
});
