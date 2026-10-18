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

// Two presses spend the file, so this is its only test.
it("reports a message to GRIDGO with one of the API's reasons", async () => {
  mockReportShopChatMessage.mockResolvedValue(undefined);
  mockGetShopChat.mockResolvedValue({
    chat,
    messages: [
      { id: "m2", senderLabel: "Print shop", body: "Message me on [contact hidden].", mine: false, createdAt: "2026-10-17T04:02:00.000Z", attachments: [] },
    ],
    nextAfter: null,
  });
  await renderScreen(<ShopChatScreen />);

  fireEvent.press(await screen.findByLabelText("Report this message"));
  expect(await screen.findByText("Why are you reporting this?")).toBeTruthy();
  expect(screen.getByLabelText("Rude or inappropriate")).toBeTruthy();
  expect(screen.getByLabelText("Changing the order in chat")).toBeTruthy();
  expect(screen.getByLabelText("Something else")).toBeTruthy();
  fireEvent.press(screen.getByLabelText("Sharing contact details"));

  await waitFor(() => expect(mockReportShopChatMessage).toHaveBeenCalledWith("order_1", "m2", "contact_sharing"));
  expect(await screen.findByText("Reported to GRIDGO")).toBeTruthy();
  expect(screen.queryByText("Why are you reporting this?")).toBeNull();
});
