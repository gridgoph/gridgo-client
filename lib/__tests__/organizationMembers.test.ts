import { ApiError } from "@/lib/api";
import {
  askedLine,
  benefitLines,
  eventLine,
  fixMessage,
  inviteEvening,
  isNotPartner,
  isStaleMember,
  lastDay,
  memberErrorMessage,
  memberInviteLink,
  memberInviteMessage,
  memberMonthOptions,
  memberSinceLine,
  memberYearOptions,
  membersRowDetail,
  monthYear,
  opensMembers,
  opensPartnership,
  ordersLine,
  partnershipRowDetail,
  perkHeadline,
  perksUsedLine,
  perkTerms,
  pickFrom,
  pickProblem,
  pickValue,
  returningLine,
  saveListLabel,
  termEndsLine,
  withYear,
} from "@/lib/organizationMembers";
import { EVENT, MEMBER, PARTNERSHIP, SUMMARY, TERM } from "@/test/organizationMembers";

const NOW = new Date("2026-11-26T04:00:00.000Z");
const refused = (status: number, error: string) => new ApiError(status, { error });

describe("dates", () => {
  it("reads a joining month and never a made-up one", () => {
    expect(monthYear("2024-08-15")).toBe("Aug 2024");
    expect(monthYear("2024-08")).toBe("Aug 2024");
    expect(monthYear("2024-13")).toBeNull();
    expect(memberSinceLine(null)).toBe("Member since date not set");
  });

  it("starts the pickers empty, or on somebody's own date", () => {
    expect(pickFrom(null)).toEqual({ year: "", month: "" });
    expect(pickFrom("2023-02-14")).toEqual({ year: "2023", month: "02" });
  });

  it("offers no month that has not started, read in Manila", () => {
    expect(memberMonthOptions("2026", NOW).at(-1)).toEqual({ value: "11", label: "November" });
    expect(memberMonthOptions("2025", NOW)).toHaveLength(12);
    expect(memberYearOptions(NOW)[0]).toEqual({ value: "2026", label: "2026" });
    // 31 Dec 17:00 UTC is already January in Manila.
    expect(memberYearOptions(new Date("2026-12-31T17:00:00.000Z"))[0]!.value).toBe("2027");
  });

  it("answers only a whole month that is not in the future", () => {
    expect(pickValue({ year: "2024", month: "08" }, NOW)).toBe("2024-08");
    expect(pickValue({ year: "2024", month: "" }, NOW)).toBeNull();
    expect(pickValue({ year: "2026", month: "12" }, NOW)).toBeNull();
  });

  it("asks only for what is missing", () => {
    expect(pickProblem({ year: "", month: "" }, NOW)).toBe("Choose the month and year they joined.");
    expect(pickProblem({ year: "", month: "06" }, NOW)).toBe("Choose the year they joined.");
    expect(pickProblem({ year: "2024", month: "" }, NOW)).toBe("Choose the month they joined.");
    expect(pickProblem({ year: "2024", month: "06" }, NOW)).toBeNull();
  });

  it("says a returning member's month as it is written", () => {
    expect(returningLine("2023-06-12")).toBe("Was a member before, since Jun 2023");
    expect(returningLine(null)).toBeNull();
  });

  it("clears a month the new year does not have yet, and never moves it", () => {
    expect(withYear({ year: "2025", month: "12" }, "2026", NOW)).toEqual({ year: "2026", month: "" });
    expect(withYear({ year: "2025", month: "03" }, "2026", NOW)).toEqual({ year: "2026", month: "03" });
  });

  it("says when somebody asked, and how", () => {
    expect(askedLine("2026-11-26T01:00:00.000Z", "qr", NOW)).toBe("Asked today · by QR");
    expect(askedLine("2026-11-25T02:00:00.000Z", "link", NOW)).toBe("Asked yesterday · by link");
    expect(askedLine("2026-11-01T02:00:00.000Z", "link", NOW)).toMatch(/^Asked .*Nov.* · by link$/);
  });

  it("reads a midnight end as the last day it holds", () => {
    expect(lastDay("2027-05-31T16:00:00.000Z")).toMatch(/31/);
    expect(lastDay(null)).toBeNull();
    expect(termEndsLine(TERM)).toMatch(/^Term ends .*2027/);
  });

  it("says which evening invites go out", () => {
    expect(inviteEvening(new Date("2026-11-26T04:00:00.000Z"))).toMatch(/^this evening/);
    expect(inviteEvening(new Date("2026-11-26T13:00:00.000Z"))).toMatch(/^tomorrow evening/);
  });
});

describe("the perk is GRIDGO's figure, and always up to", () => {
  it("never promises the whole amount", () => {
    expect(perkHeadline(2000)).toBe("Up to ₱20.00 off an order");
    expect(perkTerms(PARTNERSHIP.perk!)).toMatch(/^For up to 3 orders per member each term · until /);
  });

  it("says no word about the fee behind it", () => {
    const words = [perkHeadline(2000), perkTerms(PARTNERSHIP.perk!), ...benefitLines(PARTNERSHIP)].join(" ");
    expect(words).not.toMatch(/fee/i);
  });

  it("lists only the benefits GRIDGO set", () => {
    expect(benefitLines(PARTNERSHIP)).toEqual(["Partner badge on your organization", "Joint promos on GRIDGO's page"]);
  });
});

describe("rows and counts", () => {
  it("leads Account's row with what waits on the officer", () => {
    expect(membersRowDetail(SUMMARY)).toBe("47 active · 2 requests to answer · SY 2026-27");
    expect(membersRowDetail({ ...SUMMARY, requestCount: 0, expiredCount: 9 })).toBe("47 active · 9 to renew · SY 2026-27");
    expect(membersRowDetail(null)).toMatch(/invite link/);
    expect(partnershipRowDetail(PARTNERSHIP)).toBe("18 members ordered · 2 liquidation records");
  });

  it("draws one member without counting anything itself", () => {
    expect(ordersLine(MEMBER)).toBe("5 orders this term");
    expect(ordersLine({ ordersThisTerm: 0 })).toBe("No order yet this term");
    expect(perksUsedLine(MEMBER)).toBe("1 of 3");
    expect(perksUsedLine({ perksUsed: 2, perksPerTerm: null })).toBe("2");
    expect(eventLine(EVENT)).toBe("2 orders · ₱2,450.00 · Sep 2026");
    expect(saveListLabel(1)).toBe("Save 1 person");
  });
});

describe("the invite", () => {
  it("is the app's own link for GRIDGO's path", () => {
    expect(memberInviteLink("gridgo-client:///", "/join/abc")).toBe("gridgo-client:///join/abc");
    expect(memberInviteLink("exp://10.0.0.2:8081/--", "/join/abc")).toBe("exp://10.0.0.2:8081/--/join/abc");
  });

  it("carries the link and the way to get the app", () => {
    const message = memberInviteMessage({ label: "SAMPLE", term: TERM, link: "x://join/abc", downloadUrl: "https://get.example" });
    expect(message).toContain("Join SAMPLE on GRIDGO for SY 2026-27");
    expect(message).toContain("x://join/abc");
    expect(message).toContain("https://get.example");
  });
});

describe("inbox", () => {
  it("opens Members for an officer and not for a member", () => {
    expect(opensMembers("membership.requested", "organization")).toBe(true);
    expect(opensMembers("membership.confirmed", "individual")).toBe(false);
    expect(opensMembers("order_state", "organization")).toBe(false);
    expect(opensPartnership("organization_partner.set")).toBe(true);
  });
});

describe("refusals", () => {
  it("knows an account that is not a live partner, and a GRIDGO without members", () => {
    expect(isNotPartner(refused(403, "organization_partner_required"))).toBe(true);
    expect(isNotPartner(refused(403, "officer_of_record_required"))).toBe(true);
    expect(isNotPartner(refused(404, "not_found"))).toBe(true);
    expect(isNotPartner(refused(404, "membership_not_found"))).toBe(false);
    expect(isNotPartner(new Error("offline"))).toBe(false);
  });

  it("knows when to read again", () => {
    expect(isStaleMember(refused(409, "membership_stale"))).toBe(true);
    expect(isStaleMember(refused(409, "member_list_daily_limit"))).toBe(false);
  });

  it.each([
    "officer_of_record_required",
    "organization_partner_required",
    "membership_stale",
    "membership_not_pending",
    "membership_not_active",
    "membership_not_expired",
    "member_list_daily_limit",
    "event_order_already_recorded",
    "invalid_event_orders",
    "organization_event_stale",
  ])("says %s in plain words", (code) => {
    const message = memberErrorMessage(refused(409, code), "fallback");
    expect(message).not.toBe("fallback");
    expect(message).not.toContain("_");
  });

  it("says what is wrong with a listed row", () => {
    expect(fixMessage("invalid_member_contact", "x")).toBe("No working email or mobile");
    expect(fixMessage("something_new", "From GRIDGO")).toBe("From GRIDGO");
  });
});
