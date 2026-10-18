import { fireEvent, render, screen } from "@testing-library/react-native";
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

// One press per file.
it("refuses a file over the API's 10 MB limit before uploading anything", async () => {
  mockGetShopChat.mockResolvedValue({ chat, messages: [], nextAfter: null });
  mockGetDocumentAsync.mockResolvedValue({
    canceled: false,
    assets: [{ uri: "file:///cache/scan.pdf", name: "scan.pdf", mimeType: "application/pdf", size: 10 * 1024 * 1024 + 1 }],
  });
  await renderScreen(<ShopChatScreen />);

  fireEvent.press(await screen.findByLabelText("Attach photos or a PDF"));

  expect(await screen.findByText("Each file can be up to 10 MB.")).toBeTruthy();
  expect(mockGetDocumentAsync).toHaveBeenCalledWith(
    expect.objectContaining({ type: ["image/jpeg", "image/png", "image/webp", "application/pdf"], multiple: true }),
  );
  expect(mockUploadFile).not.toHaveBeenCalled();
  expect(screen.queryByText("scan.pdf")).toBeNull();
});
