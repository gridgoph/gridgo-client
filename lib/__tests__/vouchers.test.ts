import { ApiError, type CartQuote } from "@/lib/api";
import { orderPrintingMinor } from "@/lib/serviceFee";
import {
  appliedNote,
  checkoutCandidates,
  checkoutVoucherView,
  clockOffsetMs,
  codeAdded,
  codeShapeProblem,
  countdownLabel,
  countdownTickMs,
  exactTime,
  expiryTone,
  lockedUntilOf,
  stubAmount,
  voucherErrorMessage,
  voucherNotificationCopy,
  voucherRuleLine,
  voucherState,
  voucherStateLine,
  walletSummary,
  walletTab,
  walletTabOf,
} from "@/lib/vouchers";
import { HOUR, VOUCHER_NOW, voucher } from "@/test/voucherFixtures";

const at = (ms: number) => new Date(VOUCHER_NOW + ms).toISOString();

function quote(overrides: Partial<CartQuote> = {}): CartQuote {
  return {
    status: "priced",
    reasons: [],
    clientItemSubtotalMinor: 4400,
    deliveryLines: [],
    deliveryFeeMinor: 2500,
    totalMinor: 6900,
    downpaymentPercent: 100,
    downpaymentMinor: 6900,
    balanceMinor: 0,
    voucher: null,
    voucherDiscountMinor: 0,
    discountKind: null,
    ...overrides,
  };
}

describe("the countdown", () => {
  it("turns amber under 48 hours and red under 24, never earlier", () => {
    expect(expiryTone(48 * HOUR)).toBe("calm");
    expect(expiryTone(48 * HOUR - 1)).toBe("soon");
    expect(expiryTone(24 * HOUR)).toBe("soon");
    expect(expiryTone(24 * HOUR - 1)).toBe("urgent");
    expect(expiryTone(0)).toBe("over");
  });

  it("says the time left in words, finer as the end nears", () => {
    expect(countdownLabel(7 * 24 * HOUR)).toBe("7 days left");
    expect(countdownLabel(30 * HOUR)).toBe("1 day 6 h left");
    expect(countdownLabel(24 * HOUR)).toBe("1 day left");
    expect(countdownLabel(9 * HOUR + 59 * 60_000)).toBe("9 h 59 min left");
    expect(countdownLabel(4 * 60_000 + 10_000)).toBe("4 min 10 s left");
    expect(countdownLabel(0)).toBe("Expired");
  });

  it("ticks every second only in the last hour", () => {
    expect(countdownTickMs(2 * HOUR)).toBe(30_000);
    expect(countdownTickMs(HOUR - 1)).toBe(1000);
  });

  it("states the exact expiry in Davao time", () => {
    expect(exactTime("2026-10-16T08:00:00.000Z")).toBe("Fri, 16 Oct, 4:00 PM");
  });

  it("runs on GRIDGO's clock, not the phone's", () => {
    expect(clockOffsetMs("2026-10-09T08:05:00.000Z", VOUCHER_NOW)).toBe(5 * 60_000);
    expect(clockOffsetMs(null, VOUCHER_NOW)).toBe(0);
  });
});

describe("the wallet", () => {
  const wallet = [
    voucher({ id: "late", expiresAt: at(100 * HOUR) }),
    voucher({ id: "soon", expiresAt: at(10 * HOUR) }),
    voucher({ id: "used", status: "used" }),
    voucher({ id: "void", status: "void" }),
    voucher({ id: "gone", status: "expired", expiresAt: at(-HOUR) }),
  ];

  it("files each voucher under Available, Used or Expired, soonest first", () => {
    expect(walletTab(wallet, "available", VOUCHER_NOW).map((v) => v.id)).toEqual(["soon", "late"]);
    expect(walletTab(wallet, "used", VOUCHER_NOW).map((v) => v.id)).toEqual(["used"]);
    expect(walletTab(wallet, "expired", VOUCHER_NOW).map((v) => v.id).sort()).toEqual(["gone", "void"]);
  });

  it("moves a voucher to Expired the moment its time passes, without a reload", () => {
    expect(walletTabOf(voucher({ expiresAt: at(1000) }), VOUCHER_NOW)).toBe("available");
    expect(walletTabOf(voucher({ expiresAt: at(1000) }), VOUCHER_NOW + 1000)).toBe("expired");
  });

  it("says whether a held voucher is on this basket or an order already placed", () => {
    const held = voucher({ redeemable: false, reservation: { id: "vres_1", cartId: "cart_1", expiresAt: at(HOUR / 2) } });
    const here = voucherState(held, VOUCHER_NOW, "cart_1");
    expect(here).toEqual({ kind: "held", onThisBasket: true, until: held.reservation?.expiresAt });
    expect(voucherStateLine(here, held)).toBe("Held for your current order until 4:30 PM. Place the order before then.");
    const elsewhere = voucherState(held, VOUCHER_NOW, "cart_2");
    expect(voucherStateLine(elsewhere, held)).toMatch(/^Held for an order\. It is used once GRIDGO confirms the payment/);
  });

  it("keeps a paused offer's voucher but says it cannot be used now", () => {
    const paused = voucher({ redeemable: false });
    expect(voucherState(paused, VOUCHER_NOW).kind).toBe("paused");
  });

  it("sums the wallet up for Account", () => {
    expect(walletSummary({ serverTime: "", vouchers: wallet }, VOUCHER_NOW)).toBe(
      "2 vouchers · the next expires Sat, 10 Oct, 2:00 AM",
    );
    expect(walletSummary({ serverTime: "", vouchers: [] }, VOUCHER_NOW)).toMatch(/^Add a voucher code/);
  });

  it("draws a whole amount without centavos on the stub", () => {
    expect(stubAmount(1500)).toBe("₱15");
    expect(stubAmount(1250)).toBe("₱12.50");
  });
});

describe("adding a code", () => {
  it("checks the shape before GRIDGO counts a wrong guess", () => {
    expect(codeShapeProblem("  ")).toBe("Type the code first.");
    expect(codeShapeProblem("ab")).toMatch(/4 to 40 letters/);
    expect(codeShapeProblem("bad code!")).toMatch(/4 to 40 letters/);
    expect(codeShapeProblem(" testers15 ")).toBeNull();
  });

  it("says added, already there, already used or expired — never 'added' for a spent one", () => {
    expect(codeAdded({ voucher: voucher(), issued: true }, VOUCHER_NOW)).toMatchObject({
      ok: true,
      usable: true,
      message: "₱15.00 voucher added. Use it before Fri, 16 Oct, 4:00 PM.",
    });
    expect(codeAdded({ voucher: voucher(), issued: false }, VOUCHER_NOW).message).toBe(
      "This ₱15.00 voucher is already in your wallet.",
    );
    expect(codeAdded({ voucher: voucher({ status: "used" }), issued: false }, VOUCHER_NOW)).toMatchObject({
      usable: false,
      message: "You have already used the voucher from this code.",
    });
    expect(codeAdded({ voucher: voucher({ expiresAt: at(-HOUR) }), issued: false }, VOUCHER_NOW).message).toBe(
      "The voucher from this code expired Fri, 9 Oct, 3:00 PM.",
    );
  });

  it("words every refusal plainly, and the lock with the time it opens", () => {
    const invalid = new ApiError(400, { error: "voucher_code_invalid" });
    expect(voucherErrorMessage(invalid, "x")).toMatch(/^GRIDGO does not recognise that code/);
    const locked = new ApiError(429, { error: "voucher_code_locked", retryAt: at(15 * 60_000) });
    expect(lockedUntilOf(locked)).toBe(at(15 * 60_000));
    expect(voucherErrorMessage(locked, "x")).toBe("Too many codes that did not work. You can try again at 4:15 PM.");
    expect(voucherErrorMessage(new ApiError(409, { error: "voucher_not_better_than_organization" }), "x")).toMatch(
      /organization discount saves as much or more/,
    );
    expect(voucherErrorMessage(new ApiError(500, { error: "boom" }), "fallback")).toBe("fallback");
    for (const message of [invalid, locked].map((e) => voucherErrorMessage(e, ""))) {
      expect(message).not.toMatch(/voucher_/);
    }
  });
});

describe("checkout", () => {
  const one = voucher();
  const two = voucher({ id: "vch_2", expiresAt: at(30 * HOUR) });

  it("offers only vouchers free to use, or already held for this basket", () => {
    const heldHere = voucher({ id: "here", redeemable: false, reservation: { id: "r", cartId: "cart_1", expiresAt: at(HOUR) } });
    const heldThere = voucher({ id: "there", redeemable: false, reservation: { id: "r2", cartId: "cart_9", expiresAt: at(HOUR) } });
    const paused = voucher({ id: "paused", redeemable: false });
    expect(checkoutCandidates([one, heldHere, heldThere, paused], "cart_1", VOUCHER_NOW).map((v) => v.id)).toEqual([
      "vch_1",
      "here",
    ]);
  });

  it("shows GRIDGO's own pick as applied, previewed until held", () => {
    const view = checkoutVoucherView({
      quote: quote({ voucher: one, voucherDiscountMinor: 1500, discountKind: "voucher", totalMinor: 5400 }),
      candidates: [one],
      isOrganization: false,
      removed: false,
    });
    expect(view.kind).toBe("applied");
    if (view.kind !== "applied") return;
    expect(view.heldUntil).toBeNull();
    expect(appliedNote(view)).toBe("Applied automatically. GRIDGO holds it for you when you place the order.");
    const held = { ...view, heldUntil: at(30 * 60_000) };
    expect(appliedNote(held)).toBe("Held for this order until 4:30 PM.");
  });

  it("says when less than the face value applies, and that the rest is not kept", () => {
    const view = checkoutVoucherView({
      quote: quote({ voucher: one, voucherDiscountMinor: 900, discountKind: "voucher" }),
      candidates: [one],
      isOrganization: false,
      removed: false,
    });
    if (view.kind !== "applied") throw new Error(view.kind);
    expect(appliedNote(view)).toMatch(/^₱9\.00 of this ₱15\.00 voucher applies here.*The rest is not kept\./);
  });

  it("says which discount won when an organization holds a voucher", () => {
    const voucherWins = checkoutVoucherView({
      quote: quote({ voucher: one, voucherDiscountMinor: 1500, discountKind: "voucher" }),
      candidates: [one],
      isOrganization: true,
      removed: false,
    });
    if (voucherWins.kind !== "applied") throw new Error(voucherWins.kind);
    expect(appliedNote(voucherWins)).toMatch(/saves more than your organization discount.*never combine/);

    const organizationWins = checkoutVoucherView({
      quote: quote({ discountKind: "organization", organizationDiscountMinor: 2000 }),
      candidates: [one],
      isOrganization: true,
      removed: false,
    });
    expect(organizationWins.kind).toBe("organization");
  });

  it("asks the client to choose between several, and remembers a removal", () => {
    expect(checkoutVoucherView({ quote: quote(), candidates: [one, two], isOrganization: false, removed: false })).toEqual({
      kind: "choose",
      candidates: [one, two],
      removed: false,
    });
    expect(checkoutVoucherView({ quote: quote(), candidates: [one], isOrganization: false, removed: true })).toMatchObject({
      kind: "choose",
      removed: true,
    });
  });

  it("waits for a total, and offers only a code when the wallet has nothing", () => {
    expect(
      checkoutVoucherView({ quote: quote({ totalMinor: null, status: "incomplete" }), candidates: [one], isOrganization: false, removed: false })
        .kind,
    ).toBe("waiting");
    expect(checkoutVoucherView({ quote: quote(), candidates: [], isOrganization: false, removed: false }).kind).toBe("none");
  });

  it("names the fee only while Operations shows it", () => {
    expect(voucherRuleLine(true)).toMatch(/service fee/);
    expect(voucherRuleLine(false)).not.toMatch(/fee|%/i);
  });
});

describe("a placed order", () => {
  it("keeps Printing gross, so Printing + Delivery − Voucher = Total", () => {
    // ₱44 printing + ₱25 delivery − ₱15 voucher = ₱54.
    expect(orderPrintingMinor({ totalMinor: 5400, deliveryFeeMinor: 2500, voucherDiscountMinor: 1500 })).toBe(4400);
  });
});

describe("the inbox", () => {
  const body = "Soft-launch tester thanks: PHP 15.00. Expires 2026-10-16T08:00:00.000Z. Open your voucher wallet to use it.";

  it("rewrites GRIDGO's email-shaped body into the app's words", () => {
    expect(voucherNotificationCopy("voucher_issued", body)).toEqual({
      title: "₱15.00 voucher from GRIDGO",
      body: "Your ₱15.00 voucher is in your wallet. GRIDGO pays for it.",
      expiresAt: "2026-10-16T08:00:00.000Z",
    });
    expect(voucherNotificationCopy("voucher_expiry_24h", body)?.title).toBe("Your voucher expires within a day");
    expect(voucherNotificationCopy("voucher_expiry_48h", body)?.title).toBe("Your voucher expires within 2 days");
  });

  it("still reads without the amount or date, and ignores other types", () => {
    expect(voucherNotificationCopy("voucher_issued", "")?.body).toBe("Your voucher is in your wallet. GRIDGO pays for it.");
    expect(voucherNotificationCopy("order_receipt_ready", body)).toBeNull();
  });
});

describe("voucher notices in the inbox and on the lock screen", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { presentNotification } = require("@/lib/notificationPresentation");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { parsePushData, pushTargetRoute } = require("@/lib/push");
  const row = (type: string) => ({
    id: "not_1",
    userId: "u1",
    type,
    title: "Your GRIDGO voucher is ready",
    body: "Soft-launch tester thanks: PHP 15.00. Expires 2026-10-16T08:00:00.000Z. Open your voucher wallet to use it.",
    voucherId: "vch_1",
    read: false,
    at: "2026-10-09T08:00:00.000Z",
  });

  it("draws an issued voucher as an update with the way to use it, never a raw timestamp", () => {
    const view = presentNotification(row("voucher_issued"));
    expect(view.title).toBe("₱15.00 voucher from GRIDGO");
    expect(view.body).not.toMatch(/2026-10-16T|PHP/);
    expect(view.lane).toBe("update");
    expect(view.hint).toBe("Opens your vouchers");
    expect(view.callout).toMatchObject({ tone: "info", icon: "ticket", title: "Use it before Fri, 16 Oct, 4:00 PM" });
    expect(view.railKind).toBeNull();
  });

  it("puts the reminder's expiry in the callout, red on the last day", () => {
    expect(presentNotification(row("voucher_expiry_24h")).callout).toMatchObject({
      tone: "error",
      title: "Use it before Fri, 16 Oct, 4:00 PM",
    });
    expect(presentNotification(row("voucher_expiry_48h")).callout?.tone).toBe("warning");
  });

  it("opens the wallet from a tapped push", () => {
    expect(pushTargetRoute(parsePushData({ type: "voucher_expiry_24h", notificationId: "not_1" }))).toBe("/vouchers");
  });
});
