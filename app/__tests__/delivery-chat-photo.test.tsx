import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import DeliveryChatScreen from "@/app/order/delivery-chat";

const mockStackScreen = jest.fn((_props: { options?: unknown }) => null);

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true }),
  useLocalSearchParams: () => ({ orderId: "order_1" }),
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

const mockGetDocumentAsync = jest.fn();
jest.mock("@/lib/nativeModules", () => ({
  getDocumentPickerNative: () => ({ getDocumentAsync: (...args: unknown[]) => mockGetDocumentAsync(...args) }),
}));

const mockGetDeliveryChat = jest.fn();
const mockSendDeliveryMessage = jest.fn();
const mockUploadFile = jest.fn();
jest.mock("@/lib/api", () => ({
  getDeliveryChat: (...args: unknown[]) => mockGetDeliveryChat(...args),
  sendDeliveryMessage: (...args: unknown[]) => mockSendDeliveryMessage(...args),
  uploadFile: (...args: unknown[]) => mockUploadFile(...args),
  getFileDownloadUrl: () => Promise.resolve({ url: "https://files.example.invalid/gate.jpg" }),
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

// Two presses spend the file, so this is its only test.
it("uploads a picked photo as a delivery chat image and sends it as the message", async () => {
  const open = { status: "open", closesAt: null, retentionHours: 24 };
  mockGetDeliveryChat.mockResolvedValue({ chat: open, messages: [] });
  mockGetDocumentAsync.mockResolvedValue({
    canceled: false,
    assets: [{ uri: "file:///cache/gate.jpg", name: "gate.jpg", mimeType: "image/jpeg", size: 2048 }],
  });
  mockUploadFile.mockReturnValue({ done: Promise.resolve({ fileId: "file_gate" }), abort: jest.fn() });
  mockSendDeliveryMessage.mockResolvedValue({
    chat: open,
    message: {
      id: "m1",
      senderRole: "client",
      body: "",
      attachments: [{ fileId: "file_gate", contentType: "image/jpeg", originalFilename: "gate.jpg" }],
      createdAt: "2026-10-07T16:05:00.000Z",
      mine: true,
    },
  });
  await renderScreen(<DeliveryChatScreen />);

  fireEvent.press(await screen.findByLabelText("Add photos"));
  expect(await screen.findByText("gate.jpg")).toBeTruthy();
  fireEvent.press(screen.getByLabelText("Send"));

  await waitFor(() => expect(mockSendDeliveryMessage).toHaveBeenCalledWith("order_1", "", { attachmentFileIds: ["file_gate"] }));
  expect(mockUploadFile).toHaveBeenCalledWith(
    expect.objectContaining({ uri: "file:///cache/gate.jpg", name: "gate.jpg" }),
    "delivery_chat_image",
  );
  expect(await screen.findByLabelText("gate.jpg")).toBeTruthy();
});
