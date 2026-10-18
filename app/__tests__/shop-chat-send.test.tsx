import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import ShopChatScreen from "@/app/order/shop-chat";
import { useNotifications } from "@/store/notifications";

const mockStackScreen = jest.fn((_props: { options?: unknown }) => null);

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true }),
  useLocalSearchParams: () => ({ orderId: "order_1" }),
  useFocusEffect: (effect: () => void | (() => void)) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useEffect } = require("react");
    useEffect(effect, [effect]);
  },
  Stack: { Screen: (props: { options?: unknown }) => mockStackScreen(props) },
}));

jest.mock("react-native-keyboard-controller", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { View } = require("react-native");
  return { KeyboardAvoidingView: View };
});

jest.mock("@/hooks/useLiveRefresh", () => ({ useLiveRefresh: () => undefined }));

const mockGetDocumentAsync = jest.fn();
jest.mock("@/lib/nativeModules", () => ({
  getDocumentPickerNative: () => ({ getDocumentAsync: (...args: unknown[]) => mockGetDocumentAsync(...args) }),
}));

const mockGetShopChat = jest.fn();
const mockSendShopChatMessage = jest.fn();
const mockReportShopChatMessage = jest.fn();
const mockUploadFile = jest.fn();
jest.mock("@/lib/api", () => ({
  getShopChat: (...args: unknown[]) => mockGetShopChat(...args),
  sendShopChatMessage: (...args: unknown[]) => mockSendShopChatMessage(...args),
  reportShopChatMessage: (...args: unknown[]) => mockReportShopChatMessage(...args),
  uploadFile: (...args: unknown[]) => mockUploadFile(...args),
  getFileDownloadUrl: jest.fn(),
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

const chat = { status: "open", closesAt: null, reminder: "Chat messages do not change the order.", unread: 0, contactAttempts: 0 };

beforeEach(() => {
  useNotifications.setState({ items: [], readIds: [] });
});

// A whole send spends the file, so this is its only test.
it("shows the masked text the server returns for the client's own message, and its warning", async () => {
  const warning =
    "Contact details are hidden. Keep communication and payment within GRIDGO. This thread has been flagged for Operations review.";
  mockGetShopChat.mockResolvedValue({ chat, messages: [], nextAfter: null });
  mockSendShopChatMessage.mockResolvedValue({
    chat: { ...chat, contactAttempts: 3, warning },
    message: {
      id: "m9",
      senderLabel: "Client",
      body: "Call [contact hidden] or [contact hidden]",
      mine: true,
      createdAt: "2026-10-17T04:09:00.000Z",
      attachments: [],
    },
    warning,
  });
  await renderScreen(<ShopChatScreen />);

  const field = await screen.findByPlaceholderText("Write to the print shop");
  fireEvent.changeText(field, "Call 0917.123.4567 or hello at example dot com");
  await waitFor(() =>
    expect(screen.getByPlaceholderText("Write to the print shop").props.value).toBe("Call 0917.123.4567 or hello at example dot com"),
  );
  fireEvent.press(screen.getByLabelText("Send"));

  await waitFor(() =>
    expect(mockSendShopChatMessage).toHaveBeenCalledWith("order_1", "Call 0917.123.4567 or hello at example dot com", []),
  );
  expect(await screen.findByText("Call [contact hidden] or [contact hidden]")).toBeTruthy();
  expect(screen.queryByText(/0917/)).toBeNull();
  expect(screen.getByText("Contact details were hidden. Keep talking and paying through GRIDGO.")).toBeTruthy();
  expect(screen.getByText(warning)).toBeTruthy();
});
