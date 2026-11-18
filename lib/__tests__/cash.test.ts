import { cashCheckoutChoice, cashOrderLine, repaymentState } from "@/lib/cash";
import { CHECKOUT_SETTINGS, checkoutCart } from "@/test/checkoutFixtures";
import type { CashDetail, Order, User } from "@/lib/api";

const user = { role: "client", accountType: "individual" } as User;
const settings = { ...CHECKOUT_SETTINGS, cash: { enabled: true, limitMinor: 150000 } };

it("offers cash only for an enabled individual delivery with a priced whole cart under the live limit", () => {
  expect(cashCheckoutChoice(settings, user, checkoutCart()).eligible).toBe(true);
  expect(cashCheckoutChoice(CHECKOUT_SETTINGS, user, checkoutCart()).eligible).toBe(false);
  expect(cashCheckoutChoice(settings, { ...user, accountType: "business" }, checkoutCart()).eligible).toBe(false);
  expect(cashCheckoutChoice(settings, { ...user, accountType: undefined }, checkoutCart()).eligible).toBe(false);
  expect(cashCheckoutChoice(settings, user, checkoutCart({ fulfillmentMode: "pickup" })).eligible).toBe(false);
  const cart = checkoutCart();
  cart.clientQuote!.clientItemSubtotalMinor = 150000;
  cart.clientQuote!.totalMinor = 10000; // Discount or per-group price cannot evade the whole-cart limit.
  expect(cashCheckoutChoice(settings, user, cart).eligible).toBe(false);
  cart.clientQuote!.clientItemSubtotalMinor = 149999;
  cart.clientQuote!.totalMinor = 170000; // Fare is excluded from the eligibility limit.
  expect(cashCheckoutChoice(settings, user, cart).eligible).toBe(true);
  expect(cashCheckoutChoice({ ...settings, cash: { enabled: true, limitMinor: 4000 } }, user, checkoutCart()).eligible).toBe(false);
  cart.clientQuote!.clientItemSubtotalMinor = null;
  expect(cashCheckoutChoice(settings, user, cart).eligible).toBe(false);
});

it("explains a barred account without revealing private settlement information", () => {
  const choice = cashCheckoutChoice(settings, user, checkoutCart(), true);
  expect(choice.eligible).toBe(false);
  expect(choice.reason).toMatch(/repay.*online/i);
});

it("never calls a cash order paid before collection and keeps unknown states readable", () => {
  expect(cashOrderLine({ cash: { method: "cash", status: "due", version: 1 } } as Order)).toBe("Cash on delivery · not collected yet");
  expect(cashOrderLine({ cash: { method: "cash", status: "collected", version: 2 } } as Order)).toBe("Paid in cash on delivery");
  expect(cashOrderLine({ cash: { method: "cash", status: "no_show_repaid", version: 3 } } as Order)).toMatch(/repaid online/i);
  expect(cashOrderLine({ cash: { method: "cash", status: "future_status", version: 3 } } as Order)).toBe("Cash on delivery · check the latest status with GRIDGO");
});

it("defaults old payloads to none and trusts server pending/rejected/confirmed states", () => {
  expect(repaymentState({} as CashDetail)).toBe("none");
  for (const status of ["pending", "rejected", "confirmed"] as const) {
    expect(repaymentState({ repayment: { status } } as CashDetail)).toBe(status);
  }
});
