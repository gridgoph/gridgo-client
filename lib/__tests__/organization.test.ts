import type { ClientOrganization, User } from "@/lib/api";
import {
  confirmOfficerQuestion,
  customRangeProblem,
  discountAmount,
  isApprovedOrganization,
  isOrganizationNotification,
  manilaDay,
  officerOfRecordName,
  officerState,
  organizationDiscountOf,
  periodRange,
  savedLine,
} from "@/lib/organization";
import { orderPrintingMinor } from "@/lib/serviceFee";
import { pushTargetRoute } from "@/lib/push";

const ORG_USER: User = {
  id: "u_org",
  email: "pta@school.edu.ph",
  name: "Ana Reyes",
  role: "client",
  accountType: "organization",
  orgName: "Grade 10 PTA",
  approvalCase: { id: "apc_1", kind: "business_client", status: "approved", version: 3 },
};

const ORGANIZATION: ClientOrganization = {
  userId: "u_org",
  name: "Grade 10 PTA",
  school: "Davao City National High School",
  email: "pta@school.edu.ph",
  currentOfficer: { id: "officer_1", fullName: "Ana Reyes", verifiedAt: "2026-07-01T02:00:00Z" },
  confirmedAt: "2026-07-01T02:00:00Z",
  nextConfirmationAt: "2026-10-01T02:00:00Z",
  confirmationRequestedAt: null,
  approvalCase: { id: "apc_1", status: "approved", version: 3 },
  actions: ["confirm_officer", "change_officer"],
};

describe("the Organizations gate", () => {
  it("opens for an organization Operations approved", () => {
    expect(isApprovedOrganization(ORG_USER)).toBe(true);
  });

  it("stays shut for personal and business accounts", () => {
    expect(isApprovedOrganization({ ...ORG_USER, accountType: "individual" })).toBe(false);
    expect(isApprovedOrganization({ ...ORG_USER, accountType: "business" })).toBe(false);
    expect(isApprovedOrganization(null)).toBe(false);
  });

  it("stays shut for an organization only declared at sign-up, or still waiting", () => {
    expect(isApprovedOrganization({ ...ORG_USER, approvalCase: null })).toBe(false);
    const pending = { ...ORG_USER, approvalCase: { ...ORG_USER.approvalCase!, status: "pending" as const } };
    expect(isApprovedOrganization(pending)).toBe(false);
  });

  it("stays open through an officer handover, when the case is pending but an officer is verified", () => {
    const pending = { ...ORG_USER, approvalCase: { ...ORG_USER.approvalCase!, status: "pending" as const } };
    expect(isApprovedOrganization(pending, ORGANIZATION)).toBe(true);
  });

  it("closes for a suspended case or a held account", () => {
    expect(
      isApprovedOrganization({ ...ORG_USER, approvalCase: { ...ORG_USER.approvalCase!, status: "suspended" } }),
    ).toBe(false);
    expect(isApprovedOrganization({ ...ORG_USER, accountStatus: "suspended" })).toBe(false);
  });
});

describe("the officer of record", () => {
  it("reads each state the card has to say", () => {
    expect(officerState(ORGANIZATION)).toBe("verified");
    expect(officerState({ ...ORGANIZATION, confirmationRequestedAt: "2026-10-01T02:00:00Z" })).toBe("confirmation_due");
    expect(officerState({ ...ORGANIZATION, approvalCase: { id: "apc_1", status: "pending", version: 4 } })).toBe(
      "handover_pending",
    );
    expect(officerState({ ...ORGANIZATION, approvalCase: { id: "apc_1", status: "rejected", version: 5 } })).toBe(
      "handover_rejected",
    );
    expect(officerState({ ...ORGANIZATION, currentOfficer: null })).toBe("no_officer");
  });

  it("asks the quarterly question by name", () => {
    expect(confirmOfficerQuestion(ORGANIZATION)).toBe("Confirm Ana Reyes is still the officer");
  });

  it("prints whatever shape the statement row carries, and nothing invented", () => {
    expect(officerOfRecordName("Ana Reyes")).toBe("Ana Reyes");
    expect(officerOfRecordName({ name: "Ana Reyes" })).toBe("Ana Reyes");
    expect(officerOfRecordName({ fullName: "Ana Reyes" })).toBe("Ana Reyes");
    expect(officerOfRecordName("")).toBeNull();
    expect(officerOfRecordName(null)).toBeNull();
  });
});

describe("the discount", () => {
  it("is drawn as a minus line and a saved line, in pesos", () => {
    expect(discountAmount(500)).toBe("−₱5.00");
    expect(savedLine(41000)).toBe("You've saved ₱410.00 with your Organization account");
  });

  it("is ignored when absent, zero or nonsense", () => {
    expect(organizationDiscountOf({})).toBe(0);
    expect(organizationDiscountOf({ organizationDiscountMinor: 0 })).toBe(0);
    expect(organizationDiscountOf({ organizationDiscountMinor: -5 })).toBe(0);
    expect(organizationDiscountOf(null)).toBe(0);
  });

  it("keeps Printing before the discount, so Printing − discount + delivery = Total", () => {
    // PHP 100 printing at a 10% fee is PHP 110 Printing; a PHP 5 discount and
    // PHP 50 delivery make a PHP 155 total. The total already has it out.
    const order = { totalMinor: 15500, deliveryFeeMinor: 5000, organizationDiscountMinor: 500 };
    const printing = orderPrintingMinor(order);
    expect(printing).toBe(11000);
    expect(printing! - 500 + 5000).toBe(order.totalMinor);
  });
});

describe("statement periods", () => {
  it("formats Manila days and ranges", () => {
    expect(manilaDay("2026-10-05")).toBe("5 Oct 2026");
    expect(manilaDay("2026-10-04T17:30:00Z")).toBe("5 Oct 2026");
    expect(periodRange("2026-10-01", "2026-12-31")).toBe("1 Oct – 31 Dec 2026");
    expect(periodRange("2025-12-01", "2026-01-31")).toBe("1 Dec 2025 – 31 Jan 2026");
  });

  it("refuses a custom range GRIDGO would refuse", () => {
    expect(customRangeProblem("2026-10-01", "2026-10-31")).toBeNull();
    expect(customRangeProblem("2026-10-31", "2026-10-01")).toContain("before");
    expect(customRangeProblem("2025-01-01", "2026-10-31")).toContain("year");
    expect(customRangeProblem("2026-10", "2026-10-31")).toContain("YYYY-MM-DD");
  });
});

describe("organization notifications", () => {
  it("open the Organizations tab, never a guessed job", () => {
    expect(isOrganizationNotification("organization_officer_confirmation")).toBe(true);
    expect(isOrganizationNotification("organization_notice")).toBe(true);
    expect(isOrganizationNotification("order_receipt_ready")).toBe(false);
    expect(pushTargetRoute({ notificationId: "ntf_1", type: "organization_notice", orderId: null, at: null })).toBe("/(tabs)/organizations");
    expect(pushTargetRoute({ notificationId: "ntf_2", type: "organization_officer_confirmation", orderId: null, at: null })).toBe("/(tabs)/organizations");
  });
});

describe("the receipt for an organization's order", () => {
  it("keeps the invoice's gross Printing and carries the discount separately", () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { receiptFromInvoice } = require("@/lib/receipt") as typeof import("@/lib/receipt");
    const view = receiptFromInvoice({
      invoiceNumber: "GG-1",
      orderId: "ord_1",
      issuedAt: "2026-10-05T01:00:00.000Z",
      currency: "PHP",
      lines: [],
      clientItemSubtotalMinor: 11000,
      deliveryLines: [],
      deliveryFeeMinor: 5000,
      totalMinor: 15500,
      organizationDiscountMinor: 500,
      paymentPlan: { method: "qr_manual", downpaymentMinor: 15500, balanceMinor: 0 },
    });
    expect(view.money).toMatchObject({ printingMinor: 11000, organizationDiscountMinor: 500, totalMinor: 15500 });
  });
});
