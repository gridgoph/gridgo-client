import { ApiError, checkoutCart, type CartQuote } from "@/lib/api";
import {
  claimCopy,
  claimOffer,
  claimRowLine,
  discountLineLabel,
  emailProblem,
  endDay,
  inviteStatus,
  inviteView,
  promotionErrorMessage,
  surveyRewardAmount,
} from "@/lib/promotions";
import { pushTargetRoute } from "@/lib/push";
import { receiptFromCheckout, receiptPaymentLine } from "@/lib/receipt";
import { rewardBadge } from "@/lib/survey";
import { appliedNote, voucherCoveredLine, voucherRuleLine, voucherSettlesUpFront } from "@/lib/vouchers";
import {
  ENDS_AT,
  foundingVoucher,
  friendOffer,
  friendPassVoucher,
  invite,
  promotions,
} from "@/test/promotionFixtures";
import { voucher } from "@/test/voucherFixtures";
import { placed } from "@/test/voucherPlaceHarness";

describe("what a client can claim", () => {
  it("offers the Founding 30 while GRIDGO says it is claimable and slots remain", () => {
    expect(claimOffer(promotions())).toEqual({ kind: "founding", amountMinor: 20000, slotsLeft: 12, endsAt: ENDS_AT });
  });

  it("offers nothing once every slot is gone, the offer has closed, or nothing was read", () => {
    expect(claimOffer(promotions({ founding: { claimable: false, slotsLeft: 0 } }))).toBeNull();
    expect(claimOffer(promotions({ founding: { claimable: true, slotsLeft: 0 } }))).toBeNull();
    expect(claimOffer(null)).toBeNull();
  });

  it("never offers either kind to a client who already holds a launch voucher", () => {
    expect(claimOffer(promotions({ founding: { voucher: foundingVoucher } }))).toBeNull();
    expect(
      claimOffer(promotions({ founding: { claimable: true }, friendPass: { voucher: friendPassVoucher, offer: friendOffer } })),
    ).toBeNull();
  });

  it("offers a waiting Friend Pass by its Founder's name when the Founding 30 is not open", () => {
    const offer = claimOffer(promotions({ founding: { claimable: false, slotsLeft: 0 }, friendPass: { offer: friendOffer } }));
    expect(offer).toEqual({ kind: "friend_pass", amountMinor: 10000, endsAt: ENDS_AT, founderName: "Ven" });
    expect(claimCopy(offer!).title).toBe("Ven invited you");
  });

  it("puts the larger Founding 30 first when both are open", () => {
    expect(claimOffer(promotions({ friendPass: { offer: friendOffer } }))?.kind).toBe("founding");
  });

  it("says the amount, that it covers the whole order once, and the last day in Davao", () => {
    const copy = claimCopy(claimOffer(promotions())!);
    expect(copy.title).toBe("₱200 off your first order");
    expect(copy.action).toBe("Redeem ₱200 off");
    expect(copy.body).toContain("whole order, printing and delivery together, once");
    expect(endDay(ENDS_AT)).toBe("Sun, 8 Nov");
    expect(copy.body).toContain("Sun, 8 Nov");
    expect(claimRowLine(claimOffer(promotions({ founding: { slotsLeft: 1 } }))!)).toBe(
      "Redeem ₱200 off your first order · Last one left",
    );
  });

  it("reads today's amount, not a fixed one", () => {
    expect(claimCopy(claimOffer(promotions({ founding: { amountMinor: 25000 } }))!).title).toBe("₱250 off your first order");
  });
});

describe("a Founder's invite", () => {
  it("is not offered to someone without a Founding voucher", () => {
    expect(inviteView(promotions())).toEqual({ kind: "none" });
    expect(inviteView(promotions({ friendPass: { voucher: friendPassVoucher } }))).toEqual({ kind: "none" });
  });

  it("asks for an email while the Founder can still invite", () => {
    expect(inviteView(promotions({ founding: { voucher: foundingVoucher, claimable: false }, friendPass: { canInvite: true } }))).toEqual({
      kind: "form",
      skipped: null,
    });
  });

  it("says where the friend's pass stands: invited, claimed, used", () => {
    const sent = invite();
    const view = inviteView(promotions({ founding: { voucher: foundingVoucher }, friendPass: { invite: sent, invites: [sent] } }));
    expect(view).toEqual({ kind: "status", invite: sent, canInviteMore: false });
    expect(inviteStatus(sent)).toMatchObject({ stage: "invited", label: "Invited" });
    expect(inviteStatus(invite({ status: "claimed" })).line).toBe("ana@example.com claimed their Friend Pass.");
    expect(inviteStatus(invite({ status: "used" })).line).toBe("ana@example.com used their Friend Pass on an order.");
    expect(inviteStatus(invite({ status: "expired" })).stage).toBe("ended");
  });

  it("says so when the friend already took another Founder's invite, rather than promising a sign-in", () => {
    const taken = inviteStatus(invite({ unmatchedReason: "account_already_attributed" }));
    expect(taken).toMatchObject({ stage: "ended", label: "Already invited" });
    expect(taken.line).toBe("ana@example.com was already invited by another Founder, so this Friend Pass cannot reach them.");
    // The usual wait for someone who has not signed up yet is still a wait.
    expect(inviteStatus(invite({ unmatchedReason: "no_client_account" })).stage).toBe("invited");
  });

  it("frees the invite when the friend was already a Founder, and says so", () => {
    const skipped = invite({ status: "skipped_already_founder" });
    const view = inviteView(
      promotions({ founding: { voucher: foundingVoucher }, friendPass: { canInvite: true, invite: skipped, invites: [skipped] } }),
    );
    expect(view).toEqual({ kind: "form", skipped });
  });

  it("is closed when the Founder cannot invite and never did", () => {
    expect(inviteView(promotions({ founding: { voucher: foundingVoucher } }))).toEqual({ kind: "closed" });
  });

  it("checks the email's shape before asking GRIDGO", () => {
    expect(emailProblem("")).toBe("Type your friend's email first.");
    expect(emailProblem("ana@")).toBe("Check the email address and try again.");
    expect(emailProblem(" ana@example.com ")).toBeNull();
  });
});

describe("every refusal in plain words", () => {
  const refused = (code: string) => new ApiError(409, { error: code });

  it.each([
    ["promotion_sold_out", "claim", "Every Founding voucher has been claimed."],
    ["promotion_sold_out", "invite", "Every Friend Pass has been given out, so GRIDGO cannot send another invite."],
    ["promotion_ended", "claim", "The launch offer has ended."],
    ["promotion_not_started", "claim", "The launch offer has not started yet. Check again soon."],
    ["promotion_disabled", "claim", "GRIDGO has paused this offer for now."],
    ["promotion_budget_reached", "claim", "GRIDGO has given out every launch discount it set aside, so this offer is closed."],
    [
      "promotion_already_has_discount",
      "claim",
      "You already have a launch discount. One launch discount per person: Founding 30 or Friend Pass, never both.",
    ],
    ["promotion_already_has_discount", "invite", "That friend already has a launch discount. Name someone else."],
    ["promotion_not_founder", "invite", "Only a Founding 30 holder can invite a friend."],
    ["promotion_invite_used", "invite", "You have already used your invite."],
    ["promotion_self_invite", "invite", "That is your own email. Type your friend's instead."],
    ["promotion_email_already_invited", "invite", "Someone has already invited that email. Name another friend."],
    ["promotion_offer_unavailable", "claim", "This Friend Pass is no longer waiting for you."],
    [
      "promotion_ineligible_account",
      "claim",
      "Launch offers are for client accounts. Staff and test accounts cannot claim or send them.",
    ],
    ["invalid_promotion_email", "invite", "Check the email address and try again."],
  ] as const)("%s (%s)", (code, action, text) => {
    expect(promotionErrorMessage(refused(code), action, "fallback")).toBe(text);
  });

  it("falls back for anything else, never showing a code", () => {
    expect(promotionErrorMessage(refused("something_new"), "claim", "fallback")).toBe("fallback");
    expect(promotionErrorMessage(new Error("network"), "claim", "fallback")).toBe("fallback");
  });
});

describe("at checkout", () => {
  it("names the launch voucher on its one discount line, and plain vouchers stay Voucher", () => {
    expect(discountLineLabel(foundingVoucher)).toBe("Founding 30");
    expect(discountLineLabel(friendPassVoucher)).toBe("Friend Pass");
    expect(discountLineLabel(voucher())).toBe("Voucher");
    expect(discountLineLabel(null)).toBe("Voucher");
  });

  it("says a whole-order voucher covers printing and delivery and never goes below ₱0", () => {
    expect(voucherRuleLine(true, true)).toBe(
      "This voucher comes off your whole order, printing and delivery together, as one discount. The total never goes below ₱0.00.",
    );
    const note = appliedNote({
      kind: "applied",
      voucher: foundingVoucher,
      amountMinor: 6900,
      heldUntil: null,
      replacedOrganization: false,
      others: [],
    });
    expect(note).toContain("₱69.00 of this ₱200.00 voucher applies here, because that is the whole order.");
    expect(note).not.toContain("GRIDGO charges");
  });
});

describe("when a launch voucher leaves nothing to pay now", () => {
  const quote = (over: Partial<CartQuote>): Pick<CartQuote, "voucher" | "voucherDiscountMinor" | "downpaymentMinor"> => ({
    voucher: foundingVoucher,
    voucherDiscountMinor: 6900,
    downpaymentMinor: 0,
    ...over,
  });

  it("reads GRIDGO's own figure for what is due now, never the total", () => {
    expect(voucherSettlesUpFront(quote({}))).toBe(true);
    // A 75% order: nothing now, a balance later. Still nothing to send.
    expect(voucherSettlesUpFront(quote({ downpaymentMinor: 0 }))).toBe(true);
    expect(voucherSettlesUpFront(quote({ downpaymentMinor: 4900 }))).toBe(false);
    // Unpriced is not zero.
    expect(voucherSettlesUpFront(quote({ downpaymentMinor: null }))).toBe(false);
  });

  it("needs a whole-order voucher actually taking something off", () => {
    expect(voucherSettlesUpFront(quote({ voucher: voucher() }))).toBe(false);
    expect(voucherSettlesUpFront(quote({ voucherDiscountMinor: 0 }))).toBe(false);
    expect(voucherSettlesUpFront(null)).toBe(false);
  });

  it("says why nothing is asked, and that a balance still comes", () => {
    expect(voucherCoveredLine("Founding 30", false)).toContain("Your Founding 30 covers the whole order");
    expect(voucherCoveredLine("Voucher", false)).toContain("Your voucher covers");
    expect(voucherCoveredLine("Friend Pass", true)).toContain("GRIDGO asks for the rest by QR before delivery.");
  });

  it("sends no payment at all, and the slip says the voucher settled it", async () => {
    const fetchMock = global.fetch as jest.Mock;
    fetchMock.mockImplementationOnce(async () => ({ ok: true, status: 200, text: async () => JSON.stringify(placed()) }));
    await checkoutCart("cart_1", null, null, null);
    const body = JSON.parse(fetchMock.mock.calls.at(-1)[1].body);
    expect(body).not.toHaveProperty("payment");

    const { order, invoice } = placed();
    const slip = receiptFromCheckout(invoice, order, "");
    expect(slip?.paymentStatus).toBe("voucher");
    expect(receiptPaymentLine(slip!)).toBe("Covered in full by your voucher");
    expect(receiptPaymentLine({ paidInFull: false, paymentStatus: "voucher" })).toBe("Downpayment covered by your voucher");
  });
});

describe("the ₱15 rewards, now adjustable", () => {
  it("shows today's survey amount once GRIDGO has said it, and ₱15 until then", () => {
    const card = { rewardEligible: true, rewardProgram: "survey" };
    expect(surveyRewardAmount(null)).toBe(1500);
    expect(surveyRewardAmount(promotions({ rewards: { surveyMinor: 2000 } }))).toBe(2000);
    expect(rewardBadge(card, surveyRewardAmount(promotions({ rewards: { surveyMinor: 2000 } })))).toBe(
      "₱20.00 voucher for the first three answers",
    );
  });
});

describe("the Friend Pass waiting notice", () => {
  it("opens the wallet, where the claim is", () => {
    expect(pushTargetRoute({ type: "promotion_friend_pass_waiting", notificationId: "not_1", orderId: null, at: null })).toBe("/vouchers");
  });
});
