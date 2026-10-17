import { render, waitFor } from "@testing-library/react-native";
import { State } from "react-native-gesture-handler";
import { fireGestureHandler, getByGestureTestId } from "react-native-gesture-handler/jest-utils";

import { NotificationCard } from "@/components/NotificationCard";
import type { Notification } from "@/lib/api";
import { MARK_READ_DISTANCE } from "@/lib/swipeRow";

const printing: Notification = {
  id: "ntf_printing",
  userId: "user_client",
  read: false,
  at: "2026-10-02T01:05:00.000Z",
  type: "order_state_changed",
  orderId: "ord_1",
  orderTitle: "Flyers",
  orderState: "in_production",
  title: "Your flyers are printing",
  body: "The shop has started on your job.",
};

function card(read: boolean, onMarkRead: () => void) {
  return (
    <NotificationCard
      group={{ key: "ord_1", orderId: "ord_1", latest: printing, items: [printing] }}
      read={read}
      onOpen={() => {}}
      onMarkRead={onMarkRead}
    />
  );
}

function drag(x: number) {
  fireGestureHandler(getByGestureTestId("notification-swipe"), [
    { state: State.BEGAN, translationX: 0 },
    { state: State.ACTIVE, translationX: x / 2 },
    { state: State.ACTIVE, translationX: x },
    { state: State.END, translationX: x },
  ]);
}

// First: a gesture fired in an earlier test leaves the next render in this
// file empty (the `fireEvent` trap in AGENTS.md).
it("takes no swipe once the card is read", async () => {
  await render(card(true, jest.fn()));
  expect(getByGestureTestId("notification-swipe").config.enabled).toBe(false);
});

it("leaves the card unread on a short drag", async () => {
  const onMarkRead = jest.fn();
  await render(card(false, onMarkRead));

  drag(-(MARK_READ_DISTANCE - 20));
  await new Promise((resolve) => setTimeout(resolve, 50));

  expect(onMarkRead).not.toHaveBeenCalled();
});

it("marks the card read on a drag past the distance", async () => {
  const onMarkRead = jest.fn();
  await render(card(false, onMarkRead));

  drag(-(MARK_READ_DISTANCE + 20));

  // The gesture hands back to JavaScript asynchronously, as it does on a phone.
  await waitFor(() => expect(onMarkRead).toHaveBeenCalledTimes(1));
});
