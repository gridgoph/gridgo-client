import type { Cart, Invoice, MatchedOrder, Voucher } from "@/lib/api";
import { useCart } from "@/store/cart";
import { useCheckoutPayment } from "@/store/checkoutPayment";
import { useVouchers } from "@/store/vouchers";
import { VOUCHER_SETTINGS, voucherCart } from "@/test/checkoutVoucherHarness";
import { multiCart } from "@/test/multiShopFixtures";
import { foundingVoucher } from "@/test/promotionFixtures";
import { withVoucher } from "@/test/voucherFixtures";

/**
 * Placing an order a launch voucher pays for (gridgo-api#315 at 4ad3d1d).
 *
 * GRIDGO's quote decides whether anything is owed now — `downpaymentMinor`
 * under a whole-order voucher — and checkout answers with how the first
 * payment settled. These carts and answers are that contract, nothing worked
 * out on the phone.
 */

/** ₱69 order, ₱200 Founding 30: nothing to pay, now or later. */
export function zeroCart(): Cart {
  return withVoucher(voucherCart(), foundingVoucher, 6900);
}

/** A ₱20 launch voucher on the same ₱69 order: ₱49 still goes by QR. */
export function cashCart(): Cart {
  const small: Voucher = { ...foundingVoucher, valueMinor: 2000 };
  return withVoucher(voucherCart(), small, 2000);
}

/**
 * A legacy 75/25 order whose voucher covered the 75% due now. Nothing is sent
 * at checkout and the 25% is still owed before delivery.
 */
export function zeroNowBalanceLaterCart(): Cart {
  const cart = zeroCart();
  return {
    ...cart,
    clientQuote: {
      ...cart.clientQuote!,
      voucherDiscountMinor: 5200,
      totalMinor: 1700,
      downpaymentPercent: 75,
      downpaymentMinor: 0,
      balanceMinor: 1700,
    },
  };
}

/** Two shop groups, every peso of both covered: the basket settles as one. */
export function zeroBasket(): Cart {
  const cart = multiCart(2);
  const total = cart.clientQuote!.totalMinor!;
  const covered = withVoucher(cart, { ...foundingVoucher, valueMinor: total }, total);
  return { ...covered, groups: covered.groups!.map((group) => ({ ...group, totalMinor: 0 })) };
}

/** What checkout answered: the first payment and who settled it. */
export function placed(
  plan: Partial<MatchedOrder["paymentPlan"]> = {},
  invoicePlan: Partial<Invoice["paymentPlan"]> = {},
): { order: MatchedOrder; invoice: Invoice } {
  const paymentPlan = {
    method: "qr_manual" as const,
    downpaymentMinor: 0,
    balanceMinor: 0,
    downpaymentStatus: "confirmed",
    downpaymentPercent: 100,
    downpaymentMethod: "gridgo_voucher",
    downpaymentConfirmationSource: "gridgo_voucher",
    ...plan,
  };
  return {
    order: { id: "ord_1", paymentPlan } as MatchedOrder,
    invoice: {
      invoiceNumber: "INV-0001",
      orderId: "ord_1",
      issuedAt: "2026-10-27T01:00:00.000Z",
      currency: "PHP",
      lines: [],
      deliveryLines: [],
      deliveryFeeMinor: 2500,
      totalMinor: 0,
      voucherDiscountMinor: 6900,
      paymentPlan: { method: "qr_manual", downpaymentMinor: 0, balanceMinor: 0, ...invoicePlan },
    } as Invoice,
  };
}

/** The screen's stores, and GRIDGO's reads, holding `cart`. */
export function holdVoucherCart(
  api: Record<"getSettings" | "getCart" | "listAddresses" | "listVouchers", jest.Mock>,
  cart: Cart,
): void {
  useCheckoutPayment.getState().reset();
  useVouchers.getState().reset();
  api.getSettings.mockResolvedValue(VOUCHER_SETTINGS);
  api.getCart.mockResolvedValue(cart);
  api.listAddresses.mockResolvedValue([]);
  api.listVouchers.mockResolvedValue({ serverTime: new Date().toISOString(), vouchers: [foundingVoucher] });
  useCart.setState({ cartId: cart.id, cart, loading: false, busy: false, error: null, hydrated: true });
}
