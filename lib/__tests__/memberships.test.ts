import { ApiError } from "@/lib/api";
import { receiptAdjustments } from "@/lib/acknowledgementReceipt";
import { CONNECTION_ERROR_MESSAGE, ConnectionError } from "@/lib/connectionError";
import {
  currentMemberships,
  endedMemberships,
  expectedMemberPerk,
  isMemberNotification,
  joinTokenInPath,
  lastDay,
  memberErrorMessage,
  memberPerkChangedMessage,
  memberPerkNote,
  memberSinceLabel,
  myOrgsLine,
  offerLine,
  opensMyOrgs,
  orgFullName,
  orgInitials,
  orgName,
  perkPause,
  readJoinText,
  withArticle,
} from "@/lib/memberships";
import { parsePushData, pushTargetRoute } from "@/lib/push";
import { orderPrintingMinor } from "@/lib/serviceFee";
import { JOIN_TOKEN, membership, membershipMatch, PERK_LINE } from "@/test/membershipFixtures";

describe("names and dates", () => {
  it("takes the short name from GRIDGO's label and shows the full one only when it adds something", () => {
    expect(orgName(membership())).toBe("Sample Guild");
    expect(orgFullName(membership())).toBe("Sample Guild of Makers");
    expect(orgFullName(membership({ organizationName: "Sample Guild" }))).toBeNull();
    expect(orgInitials(membership())).toBe("SG");
    expect(orgInitials({ label: "Makers member" })).toBe("MAK");
    expect(withArticle("Sample Guild member")).toBe("a Sample Guild member");
    expect(withArticle("Art Circle member")).toBe("an Art Circle member");
  });

  it("reads a member since month with or without its day, and nothing else", () => {
    expect(memberSinceLabel("2025-09")).toBe("Sep 2025");
    expect(memberSinceLabel("2025-09-14")).toBe("Sep 2025");
    expect(memberSinceLabel(null)).toBeNull();
    expect(memberSinceLabel("2025")).toBeNull();
  });

  it("says the last good day, not the midnight it stops", () => {
    expect(lastDay("2027-05-31T16:00:00.000Z")).toBe("31 May 2027");
    expect(lastDay("not a date")).toBeNull();
  });
});

describe("the perk", () => {
  it("is always said as up to, because it can only lower GRIDGO's fee", () => {
    expect(offerLine(membershipMatch().perk)).toBe("Up to ₱10.00 off each of 5 orders this term");
    expect(offerLine({ ...membershipMatch().perk!, maxOrdersPerTerm: 1 })).toBe("Up to ₱10.00 off each of 1 order this term");
  });

  it("promises nothing without a perk or its budget", () => {
    expect(offerLine(null)).toBeNull();
    expect(offerLine({ ...membershipMatch().perk!, budgetAvailable: false })).toBeNull();
  });

  it("explains why it is not working, and is quiet while it is", () => {
    expect(perkPause(membership())).toBeNull();
    expect(perkPause(membership({ perk: null }))).toMatch(/No member perk right now/);
    expect(perkPause(membership({ perk: { ...membership().perk!, used: 5, left: 0, available: false } }))).toMatch(
      /used every perk order.*31 May 2027/,
    );
    expect(perkPause(membership({ perk: { ...membership().perk!, available: false } }))).toMatch(/paused/);
  });

  it("says which use an order takes and what is left, only when GRIDGO priced one", () => {
    const quote = { memberPerkMinor: 400, memberPerk: PERK_LINE };
    expect(memberPerkNote(quote)).toBe("Member perk 3 of 5 this term, applied automatically. 2 left after this order.");
    expect(memberPerkNote({ ...quote, memberPerk: { ...PERK_LINE, useNumber: 5 } })).toMatch(/This is your last one\.$/);
    expect(memberPerkNote({ memberPerkMinor: 0, memberPerk: null })).toBeNull();
  });

  it("sends back exactly what the quote showed, and nothing to an API without perks", () => {
    expect(expectedMemberPerk({ memberPerkMinor: 400 })).toBe(400);
    expect(expectedMemberPerk({ memberPerkMinor: 0 })).toBe(0);
    expect(expectedMemberPerk({})).toBeUndefined();
    expect(expectedMemberPerk(null)).toBeUndefined();
  });

  it("says a changed perk with GRIDGO's own new total", () => {
    expect(memberPerkChangedMessage({ memberPerkMinor: 0, totalMinor: 6900 }, true)).toBe(
      "Your member perk can no longer be used on this order, so your total is ₱69.00. Your order was not placed. Check the new total, then place it again. Already paid? Message GRIDGO before you pay again.",
    );
    expect(memberPerkChangedMessage({ memberPerkMinor: 300, totalMinor: 6600 }, false)).toBe(
      "Your member perk is now ₱3.00 on this order, so your total is ₱66.00. Your order was not placed. Check the new total, then place it again.",
    );
    expect(memberPerkChangedMessage(null, false)).toMatch(/^Your member perk changed/);
  });
});

describe("money already out of the total", () => {
  it("keeps Printing gross, so Printing + Delivery − perk = Total", () => {
    expect(orderPrintingMinor({ totalMinor: 6500, deliveryFeeMinor: 2500, memberPerkMinor: 400 })).toBe(4400);
    expect(orderPrintingMinor({ totalMinor: 5000, deliveryFeeMinor: 2500, memberPerkMinor: 400, voucherDiscountMinor: 1500 })).toBe(4400);
  });

  it("puts the perk on the acknowledgement receipt by its label", () => {
    expect(
      receiptAdjustments({
        deliveryFeeMinor: 2500,
        organizationDiscountMinor: 0,
        memberPerkMinor: 400,
        memberPerkLabel: "Sample Guild member",
        voucherDiscountMinor: 0,
        roundingAdjustmentMinor: 0,
      }),
    ).toEqual([
      { label: "Delivery fee", value: "₱25.00" },
      { label: "Sample Guild member", value: "−₱4.00" },
    ]);
  });
});

describe("my orgs", () => {
  const pending = membership({ id: "mem_2", status: "pending", label: "Art Circle member" });
  const removed = (removedReason: string) => membership({ id: removedReason, status: "removed", removedReason });

  it("puts active first, keeps what others ended and hides what the client ended", () => {
    expect(currentMemberships([pending, membership(), removed("left")]).map((entry) => entry.id)).toEqual(["mem_1", "mem_2"]);
    expect(
      endedMemberships([removed("left"), removed("request_cancelled"), removed("declined"), removed("removed_by_officer"), removed("request_expired")]).map(
        (entry) => entry.id,
      ),
    ).toEqual(["declined", "removed_by_officer", "request_expired"]);
  });

  it("says one line on Account for every standing", () => {
    expect(myOrgsLine([], [])).toBe("Join your org to get member perks on your orders");
    expect(myOrgsLine([], [membershipMatch()])).toBe("Sample Guild lists you as a member. Open to confirm");
    expect(myOrgsLine([membership()], [])).toBe("Sample Guild · up to ₱10.00 off · 3 of 5 left");
    expect(myOrgsLine([membership({ perk: null })], [])).toBe("Sample Guild · member");
    expect(myOrgsLine([pending], [])).toBe("Art Circle · waiting for the officer");
    expect(myOrgsLine([membership({ status: "expired" })], [])).toBe("Sample Guild · term ended");
    expect(myOrgsLine([membership(), pending], [])).toBe("2 orgs · member of 1");
  });
});

describe("invite links", () => {
  it("reads the token from the app's link, a web link, a chat message and a bare code", () => {
    for (const text of [
      JOIN_TOKEN,
      `gridgoclient://join/${JOIN_TOKEN}`,
      `exp://192.168.1.5:8081/--/join/${JOIN_TOKEN}`,
      `https://example.com/join/${JOIN_TOKEN}?utm=1`,
      `Join us on GRIDGO!\nhttps://example.com/join/${JOIN_TOKEN}\nSee you`,
    ]) {
      expect(readJoinText(text)).toEqual({ ok: true, token: JOIN_TOKEN });
    }
  });

  it("refuses on the phone what GRIDGO would only count against the person", () => {
    expect(readJoinText("  ")).toMatchObject({ ok: false });
    expect(readJoinText("https://example.com/join/short")).toMatchObject({ ok: false });
    expect(readJoinText(`gridgoclient://express/group/join/${JOIN_TOKEN}`)).toEqual({
      ok: false,
      message: expect.stringMatching(/group print/),
    });
    expect(joinTokenInPath(`/express/group/join/${JOIN_TOKEN}`)).toBeNull();
    expect(joinTokenInPath("/vouchers")).toBeNull();
  });
});

describe("refusals", () => {
  const refuse = (status: number, body: object) => new ApiError(status, body);

  it("says each in plain words, never a code", () => {
    expect(memberErrorMessage(refuse(404, { error: "member_invite_not_found" }), "x")).toMatch(/newest link or QR/);
    expect(memberErrorMessage(refuse(429, { error: "member_join_rate_limited", retryAt: "2026-11-26T07:45:00.000Z" }), "x")).toBe(
      "Too many links were tried. You can try again at 3:45 PM.",
    );
    expect(memberErrorMessage(refuse(429, { error: "member_join_rate_limited" }), "x")).toMatch(/15 minutes/);
    expect(memberErrorMessage(refuse(502, { error: "clerk_unavailable" }), "x")).not.toMatch(/clerk/i);
    expect(memberErrorMessage(new ConnectionError(), "x")).toBe(CONNECTION_ERROR_MESSAGE);
    expect(memberErrorMessage(new Error("?"), "fallback")).toBe("fallback");
  });
});

describe("notices", () => {
  it("opens My orgs from a member's notice, and leaves the organization's own copy alone", () => {
    expect(isMemberNotification("membership.approved")).toBe(true);
    expect(isMemberNotification("membership.requested")).toBe(false);
    expect(opensMyOrgs({ type: "membership.confirmed", userId: "u1", organizationUserId: "org1" })).toBe(true);
    expect(opensMyOrgs({ type: "membership.confirmed", userId: "org1", organizationUserId: "org1" })).toBe(false);
    expect(opensMyOrgs({ type: "order_update", userId: "u1" })).toBe(false);
  });

  it("opens My orgs from a push, whose type is all it carries", () => {
    expect(pushTargetRoute(parsePushData({ type: "membership.approved", notificationId: "n1" }))).toBe("/my-orgs");
    expect(pushTargetRoute(parsePushData({ type: "membership.confirmed", notificationId: "n1" }))).toBe("/(tabs)/notifications");
  });
});
