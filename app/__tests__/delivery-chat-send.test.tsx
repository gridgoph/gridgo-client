import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
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
const mockSendDeliveryMessage = jest.fn();
jest.mock("@/lib/api", () => ({
  getDeliveryChat: (...args: unknown[]) => mockGetDeliveryChat(...args),
  sendDeliveryMessage: (...args: unknown[]) => mockSendDeliveryMessage(...args),
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

// One interacting test per file: a typed message and a press spend the file.
it("sends a typed message to the rider and shows it at once", async () => {
  mockGetDeliveryChat.mockResolvedValue({ chat: { status: "open", closesAt: null, retentionHours: 24 }, messages });
  mockSendDeliveryMessage.mockResolvedValue({
    chat: { status: "open", closesAt: null, retentionHours: 24 },
    message: { id: "m3", senderRole: "client", body: "The guard can receive it.", createdAt: "2026-10-07T16:05:00.000Z", mine: true },
  });
  await renderScreen(<DeliveryChatScreen />);
  const field = await screen.findByPlaceholderText("Write to your rider");

  fireEvent.changeText(field, "  The guard can receive it.  ");
  await waitFor(() => expect(screen.getByPlaceholderText("Write to your rider").props.value).toBe("  The guard can receive it.  "));
  fireEvent.press(screen.getByLabelText("Send"));

  await waitFor(() => expect(mockSendDeliveryMessage).toHaveBeenCalledWith("order_1", "The guard can receive it."));
  expect(await screen.findByText("The guard can receive it.")).toBeTruthy();
});
