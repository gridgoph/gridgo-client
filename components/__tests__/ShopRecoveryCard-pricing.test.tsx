import { render, screen } from "@testing-library/react-native";

import { ShopRecoveryCard } from "@/components/ShopRecoveryCard";
import type { Order, ShopRecovery } from "@/lib/api";
import { shopRecoveryView } from "@/lib/shopRecovery";
import { refundOrder } from "@/test/refundFixtures";
import {
  aboveCapWithAlternatives,
  awaitingPaymentRecovery,
  pricedRecovery,
  shopRecovery,
  topUpChange,
} from "@/test/shopChangeFixtures";

jest.mock("expo-router", () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock("@/components/QrTopUpForm", () => ({
  QrTopUpForm: ({ amountMinor, primary }: { amountMinor: number; primary: boolean }) => {
    const { Text: T } = jest.requireActual("react-native");
    return <T>{`top-up form ${amountMinor}${primary ? " (primary)" : ""}`}</T>;
  },
}));

/*
  gridgo-api#225: the price comparison a client reads before confirming a
  move they did not cause. refundOrder prints at ₱1,100 to the client; every
  peso drawn is one they pay, get back or are spared, never a shop's price.
  Render-only: the presses live in their own files (AGENTS.md "Running and testing").
*/
async function draw(recovery: ShopRecovery, overrides: Partial<Order> = {}) {
  const order = refundOrder({ state: "supplier_assigned", shopRecovery: recovery, ...overrides });
  await render(<ShopRecoveryCard order={order} view={shopRecoveryView(order)!} onChanged={jest.fn()} />);
}

it("shows a cheaper shop's difference coming back to the client as a refund", async () => {
  await draw(pricedRecovery("cheaper"));
  expect(screen.getByText("Your printing now")).toBeTruthy();
  expect(screen.getByText("₱1,100.00")).toBeTruthy();
  expect(screen.getByText("With the new shop")).toBeTruthy();
  expect(screen.getByText("₱1,000.00")).toBeTruthy();
  expect(screen.getByText("Comes back to you")).toBeTruthy();
  expect(screen.getByText("₱100.00")).toBeTruthy();
  expect(screen.getByText(/GRIDGO sends the difference back to you as a refund/)).toBeTruthy();
  expect(screen.getByText("Accept the new shop")).toBeTruthy();
  expect(screen.getByText("Get a full refund instead")).toBeTruthy();
  // The shops' own prices never reach the client.
  expect(screen.queryByText("₱900.00")).toBeNull();
});

it("shows a same-price shop with nothing extra to pay", async () => {
  await draw(pricedRecovery("same"));
  expect(screen.getByText("Your printing")).toBeTruthy();
  expect(screen.getByText("₱1,100.00")).toBeTruthy();
  expect(screen.getByText("Same price. You pay nothing extra.")).toBeTruthy();
  expect(screen.getByText(/nothing extra to pay\. The new shop confirms/)).toBeTruthy();
});

it("shows GRIDGO covering a dearer shop within its cover", async () => {
  await draw(pricedRecovery("covered"));
  expect(screen.getByText("₱1,140.00")).toBeTruthy();
  expect(screen.getByText("GRIDGO covers")).toBeTruthy();
  expect(screen.getByText("₱40.00")).toBeTruthy();
  expect(screen.getByText("Nothing extra")).toBeTruthy();
  expect(screen.getByText(/GRIDGO covers it, so you pay nothing extra/)).toBeTruthy();
  expect(screen.getByText("Accept the new shop")).toBeTruthy();
});

it("offers exactly three ways above GRIDGO's cover: pay the rest, another shop, or a refund", async () => {
  await draw(aboveCapWithAlternatives());
  expect(screen.getByText(/costs more than GRIDGO can cover/)).toBeTruthy();
  expect(screen.getByText("₱1,300.00")).toBeTruthy();
  expect(screen.getByText("₱50.00")).toBeTruthy();
  expect(screen.getByText("₱150.00")).toBeTruthy();
  expect(screen.queryByText("Accept the new shop")).toBeNull();
  expect(screen.getByText("Pay ₱150.00 more and accept")).toBeTruthy();
  expect(screen.getByText(/Next you pay ₱150\.00 by QR/)).toBeTruthy();
  expect(screen.getByText("Or pick another shop")).toBeTruthy();
  expect(screen.getAllByText(/^Pick the shop ready /)).toHaveLength(2);
  expect(screen.getByText(/You pay nothing extra\.$/)).toBeTruthy();
  expect(screen.getByText(/You pay ₱50\.00 more, paid by QR before it starts\./)).toBeTruthy();
  expect(screen.getByText("Get a full refund instead")).toBeTruthy();
});

it("asks for the QR payment once the client chose to pay the rest, keeping the refund", async () => {
  await draw(awaitingPaymentRecovery(), { changeRequests: [topUpChange()] });
  expect(screen.getByText("Not paid yet")).toBeTruthy();
  expect(screen.getByText("Pay ₱150.00 to move to the new shop")).toBeTruthy();
  expect(screen.getByText("top-up form 15000 (primary)")).toBeTruthy();
  expect(screen.getByText("Get a full refund instead")).toBeTruthy();
});

it("waits while Operations checks the top-up, and says not to pay again", async () => {
  await draw(awaitingPaymentRecovery(), {
    changeRequests: [
      topUpChange({
        status: "pending_confirmation",
        payment: { proofFileId: "file_1", reference: "GCASH-9", submittedAt: "2026-10-05T11:00:00+08:00" },
      }),
    ],
  });
  expect(screen.getByText("Payment being checked")).toBeTruthy();
  expect(screen.getByText(/Do not pay again/)).toBeTruthy();
  expect(screen.getByText("GCASH-9")).toBeTruthy();
  expect(screen.queryByText(/top-up form/)).toBeNull();
});

it("keeps the released same-price offer when the API sends no pricing", async () => {
  await draw(shopRecovery());
  expect(screen.getByText(/at the same price\. Choose it, or a full refund\./)).toBeTruthy();
  expect(screen.getByText(/Same item, same specs, same price\./)).toBeTruthy();
  expect(screen.queryByTestId("shop-move-price")).toBeNull();
});
