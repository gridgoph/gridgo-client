import { render, screen } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import DeliveryChatScreen from "@/app/order/delivery-chat";

const mockStackScreen = jest.fn((_props: { options?: unknown }) => null);
let mockParams: { orderId?: string } = { orderId: "order_1" };

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true }),
  useLocalSearchParams: () => mockParams,
  useFocusEffect: (effect: () => void | (() => void)) => {
    const { useEffect } = require("react");
    useEffect(effect, [effect]);
  },
  Stack: { Screen: (props: { options?: unknown }) => mockStackScreen(props) },
}));

jest.mock("react-native-keyboard-controller", () => {
  const { View } = require("react-native");
  return { KeyboardAvoidingView: View };
});

jest.mock("@/hooks/useLiveRefresh", () => ({ useLiveRefresh: () => undefined }));

const mockGetDeliveryChat = jest.fn();
jest.mock("@/lib/api", () => ({
  getDeliveryChat: (...args: unknown[]) => mockGetDeliveryChat(...args),
  sendDeliveryMessage: jest.fn(),
}));

function renderScreen(ui: ReactElement) {
  return render(ui, {
    wrapper: ({ children }) => (
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 390, height: 844 },
          insets: { top: 47, left: 0, right: 0, bottom: 34 },
        }}
      >
        {children}
      </SafeAreaProvider>
    ),
  });
}

const messages = [
  { id: "m1", senderRole: "rider", body: "On Quimpo Blvd now.", createdAt: "2026-10-07T15:57:00.000Z", mine: false },
  { id: "m2", senderRole: "client", body: "Blue gate, please.", createdAt: "2026-10-07T16:00:00.000Z", mine: true },
];

beforeEach(() => {
  mockParams = { orderId: "order_1" };
  mockGetDeliveryChat.mockReset();
});

it("shows the conversation and a composer while the rider has the job, with no call or number", async () => {
  mockGetDeliveryChat.mockResolvedValue({ chat: { status: "open", closesAt: null, retentionHours: 24 }, messages });
  await renderScreen(<DeliveryChatScreen />);

  expect(await screen.findByText("On Quimpo Blvd now.")).toBeTruthy();
  expect(mockGetDeliveryChat).toHaveBeenCalledWith("order_1");
  expect(screen.getByText("Blue gate, please.")).toBeTruthy();
  expect(screen.getByText(/^Rider ·/)).toBeTruthy();
  expect(screen.getByText(/^You ·/)).toBeTruthy();
  expect(screen.getByText(/Only you and your rider see these messages/)).toBeTruthy();
  expect(screen.getByPlaceholderText("Write to your rider")).toBeTruthy();
  expect(screen.queryByText(/call/i)).toBeNull();
});

it("keeps a delivered conversation readable but closed to new messages", async () => {
  mockGetDeliveryChat.mockResolvedValue({
    chat: { status: "read_only", closesAt: "2026-10-08T14:03:00.000Z", retentionHours: 24 },
    messages,
  });
  await renderScreen(<DeliveryChatScreen />);

  expect(await screen.findByText("On Quimpo Blvd now.")).toBeTruthy();
  expect(screen.getByText(/This delivery is finished, so no new messages can be sent/)).toBeTruthy();
  expect(screen.queryByPlaceholderText("Write to your rider")).toBeNull();
  expect(screen.getByText("Back to the order")).toBeTruthy();
});

it("says the messages were removed once the day after delivery has passed", async () => {
  mockGetDeliveryChat.mockRejectedValue(
    Object.assign(new Error("delivery_chat_closed"), { status: 410, body: { error: "delivery_chat_closed" } }),
  );
  await renderScreen(<DeliveryChatScreen />);

  expect(await screen.findByText("These messages were removed")).toBeTruthy();
  expect(screen.queryByText("On Quimpo Blvd now.")).toBeNull();
  expect(screen.queryByPlaceholderText("Write to your rider")).toBeNull();
});

it("asks for an order when opened without one", async () => {
  mockParams = {};
  await renderScreen(<DeliveryChatScreen />);
  expect(await screen.findByText("No delivery chosen")).toBeTruthy();
  expect(mockGetDeliveryChat).not.toHaveBeenCalled();
});
