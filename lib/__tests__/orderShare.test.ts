import {
  groupedCode,
  isSharePresentation,
  mayShareOrder,
  printedLink,
  recordsCard,
  repeatDue,
  shareErrorMessage,
  shareText,
  storyGreeting,
  refusalIsFinal,
  SHARE_NOT_AVAILABLE,
} from "@/lib/orderShare";
import { ApiError } from "@/lib/api";
import { orderShare, SHARE_LINK } from "@/test/shareFixtures";

describe("share card rules", () => {
  it("offers the one repeat only when GRIDGO says so, and not in the session that put it off", () => {
    const due = orderShare({}, { showAfterSurvey: false, dismissedAt: "2026-10-28T01:00:00.000Z", showFromOrder: true });
    expect(repeatDue(due, false)).toBe(true);
    // Maybe later and straight back to the order: not later yet.
    expect(repeatDue(due, true)).toBe(false);
    // The repeat was shown (or the card closed): never again.
    expect(repeatDue(orderShare({}, { ...due.card, repeatShownAt: "2026-10-29T01:00:00.000Z", showFromOrder: false }), false)).toBe(false);
    expect(repeatDue(orderShare({ available: false }, { showFromOrder: true }), false)).toBe(false);
    expect(repeatDue(undefined, false)).toBe(false);
  });

  it("puts the link beside the picture, or the code when there is no link, and never invents one", () => {
    expect(shareText(orderShare())).toContain(SHARE_LINK);
    const codeOnly = shareText(orderShare({ inviteLink: null }));
    expect(codeOnly).toContain("invite code: 0123456789ABCDEF01234567");
    expect(codeOnly).not.toMatch(/https?:/);
    expect(shareText(orderShare({ inviteLink: null, inviteCode: null }))).not.toMatch(/code|https?:/);
  });

  it("never mentions a reward or a price", () => {
    for (const text of [shareText(orderShare()), shareText(orderShare({ inviteLink: null }))]) {
      expect(text).not.toMatch(/reward|voucher|₱|free|earn/i);
    }
  });

  it("greets by first name only when there is one", () => {
    expect(storyGreeting(orderShare())).toBe("Printed for Ana");
    expect(storyGreeting(orderShare({ firstName: "  " }))).toBeNull();
  });

  it("prints the code in fours and a long link whole across lines", () => {
    expect(groupedCode("0123456789ABCDEF01234567")).toBe("0123 4567 89AB CDEF 0123 4567");
    const lines = printedLink(SHARE_LINK, 20);
    expect(lines.join("")).toBe(SHARE_LINK.replace("https://", ""));
    expect(lines.every((line) => line.length <= 20)).toBe(true);
  });

  it("reads share data for delivered or collected orders and survey orders only", () => {
    expect(mayShareOrder(null, { state: "completed", timeline: [] })).toBe(true);
    expect(mayShareOrder(null, { state: "production", timeline: [] })).toBe(false);
    expect(mayShareOrder(null, { state: "cancelled", timeline: [{ at: "x", state: "delivered" }] })).toBe(true);
    expect(mayShareOrder(null, { state: "cancelled", timeline: [], issueWindowOpenedAt: "x" })).toBe(true);
  });

  it("records card events only for GRIDGO's own card, never the order's Share button", () => {
    expect(recordsCard("after_survey")).toBe(true);
    expect(recordsCard("order_repeat")).toBe(true);
    expect(recordsCard("manual")).toBe(false);
    expect(isSharePresentation("after_survey")).toBe(true);
    expect(isSharePresentation("anything")).toBe(false);
  });

  it("drops a tap GRIDGO refused for good, and keeps one the network lost", () => {
    expect(refusalIsFinal(new ApiError(409, { error: "share_tap_conflict" }))).toBe(true);
    expect(refusalIsFinal(new ApiError(400, { error: "invalid_share_tap" }))).toBe(true);
    expect(refusalIsFinal(new ApiError(503, { error: "unavailable" }))).toBe(false);
    expect(refusalIsFinal(new ApiError(429, { error: "rate_limited" }))).toBe(false);
    expect(refusalIsFinal(new TypeError("Network request failed"))).toBe(false);
    expect(shareErrorMessage(new ApiError(409, { error: "order_share_not_available" }))).toBe(SHARE_NOT_AVAILABLE);
  });
});
