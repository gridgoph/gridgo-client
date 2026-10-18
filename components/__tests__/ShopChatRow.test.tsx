import { render, screen } from "@testing-library/react-native";

import { ShopChatRow } from "@/components/ShopChatRow";
import { SHOP_CHAT_REMINDER } from "@/lib/shopChat";
import { useNotifications } from "@/store/notifications";

const open = { status: "open" as const, closesAt: null, reminder: SHOP_CHAT_REMINDER };
const notice = (id: string, orderId: string, read = false) =>
  ({ id, userId: "u1", type: "client_shop_chat_message", orderId, read, title: "Message from Print shop", body: "", at: "2026-10-17T04:00:00.000Z" }) as never;

beforeEach(() => {
  useNotifications.setState({ items: [], readIds: [] });
});

it("offers the conversation while the order is being made", async () => {
  await render(<ShopChatRow orderId="ord_1" chat={open} onPress={jest.fn()} />);
  expect(screen.getByLabelText("Message the print shop")).toBeTruthy();
  expect(screen.getByText(/Names and contact details stay hidden/)).toBeTruthy();
});

it("says a new message has arrived, from this order's unread notice only", async () => {
  useNotifications.setState({ items: [notice("n1", "ord_1"), notice("n2", "ord_2")], readIds: [] });
  await render(<ShopChatRow orderId="ord_1" chat={open} onPress={jest.fn()} />);
  expect(screen.getByLabelText("Message the print shop, new message")).toBeTruthy();
  expect(screen.getByText("New message. Open to read it.")).toBeTruthy();
});

it("keeps a closed conversation as the order's record", async () => {
  useNotifications.setState({ items: [notice("n1", "ord_1", true)], readIds: [] });
  await render(<ShopChatRow orderId="ord_1" chat={{ ...open, status: "read_only" }} onPress={jest.fn()} />);
  expect(screen.getByLabelText("Messages with the print shop")).toBeTruthy();
  expect(screen.getByText("Closed. Kept with this order as a record.")).toBeTruthy();
});
