import { render, screen } from "@testing-library/react-native";

import { NotificationCard } from "@/components/NotificationCard";
import type { Notification } from "@/lib/api";
import { expectNoServiceFee, setServiceFeeSwitch } from "@/test/serviceFeeSwitch";

// gridgo-api writes this row's body itself, and it names the fee. The card
// draws GRIDGO's own copy for it, so the switch decides what a client reads.
const receiptReady: Notification = {
  id: "ntf_receipt",
  userId: "user_client",
  read: false,
  at: "2026-10-02T01:05:00.000Z",
  type: "order_receipt_ready",
  orderId: "ord_1",
  orderTitle: "Flyers",
  orderState: "needs_qa",
  title: "Your receipt is ready",
  body: "Open the receipt to see printing, delivery, the service fee and your payment reference.",
};

const card = (
  <NotificationCard
    group={{ key: "ord_1", orderId: "ord_1", latest: receiptReady, items: [receiptReady] }}
    read={false}
    onOpen={() => {}}
    onMarkRead={() => {}}
  />
);

it("never names the fee in the receipt-ready update while Operations hides it", async () => {
  setServiceFeeSwitch(false);
  await render(card);

  expect(screen.getByText("Your receipt is ready")).toBeTruthy();
  expectNoServiceFee(screen);
});

it("names the fee in the receipt-ready update when Operations shows it", async () => {
  setServiceFeeSwitch(true);
  await render(card);

  expect(screen.getByText(/the service fee/)).toBeTruthy();
});
