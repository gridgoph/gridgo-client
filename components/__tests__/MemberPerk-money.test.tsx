import { render, screen } from "@testing-library/react-native";

import { MemberPerkRow } from "@/components/MemberParts";
import { ShopGroupSection } from "@/components/ShopGroupSection";
import type { Invoice } from "@/lib/api";
import { shopGroups, type ShopGroupView } from "@/lib/basketGroups";
import { receiptFromInvoice } from "@/lib/receipt";
import { PERK_LINE } from "@/test/membershipFixtures";
import { multiCart } from "@/test/multiShopFixtures";

it("draws nothing when no perk came off", async () => {
  await render(<MemberPerkRow source={{ memberPerkMinor: 0 }} />);
  expect(screen.queryByTestId("member-perk-row")).toBeNull();
});

it("a shop group shows its own share of the perk", async () => {
  const group: ShopGroupView = {
    id: "g1", label: "Shop A", letter: "A", deadline: null, lines: [], itemsMinor: 11000, deliveryFeeMinor: 5000,
    totalMinor: 15800, organizationDiscountMinor: 0, memberPerkMinor: 200, zone: null, distanceKm: null,
  };
  await render(
    <ShopGroupSection group={group} pickup={false} busy={false} onAddMore={() => undefined}>
      {null}
    </ShopGroupSection>,
  );
  expect(screen.getByLabelText("Member perk on Shop A, minus ₱2.00")).toBeTruthy();
});

it("reads the share off the quote when the group does not carry it", () => {
  const cart = multiCart(2);
  const [first] = cart.groups!;
  const withShare = {
    ...cart,
    clientQuote: {
      ...cart.clientQuote!,
      voucherGroups: [{ groupId: first!.id, voucherDiscountMinor: 0, memberPerkMinor: 150, totalMinor: 1 }],
    },
  };
  expect(shopGroups(withShare).find((group) => group.id === first!.id)?.memberPerkMinor).toBe(150);
});

it("the receipt keeps the perk and its label beside the total it is already out of", () => {
  const view = receiptFromInvoice({
    invoiceNumber: "INV-0001", orderId: "ord_1", issuedAt: "2026-11-26T01:00:00.000Z", currency: "PHP", lines: [],
    deliveryLines: [], clientItemSubtotalMinor: 4400, deliveryFeeMinor: 2500, totalMinor: 6500, memberPerkMinor: 400,
    memberPerk: PERK_LINE, paymentPlan: { method: "qr_manual", downpaymentMinor: 6500, balanceMinor: 0 },
  } as unknown as Invoice, {} as never);
  expect(view?.money).toMatchObject({ memberPerkMinor: 400, memberPerkLabel: "Sample Guild member", totalMinor: 6500 });
});
