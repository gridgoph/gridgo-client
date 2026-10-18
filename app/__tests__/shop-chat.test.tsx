import { render, screen } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import ShopChatScreen from "@/app/order/shop-chat";
import { useNotifications } from "@/store/notifications";

const mockStackScreen = jest.fn((_props: { options?: unknown }) => null);
let mockParams: { orderId?: string } = { orderId: "order_1" };

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true }),
  useLocalSearchParams: () => mockParams,
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

const mockGetShopChat = jest.fn();
const mockGetFileDownloadUrl = jest.fn();
jest.mock("@/lib/api", () => ({
  getShopChat: (...args: unknown[]) => mockGetShopChat(...args),
  getFileDownloadUrl: (...args: unknown[]) => mockGetFileDownloadUrl(...args),
  sendShopChatMessage: jest.fn(),
  reportShopChatMessage: jest.fn(),
  uploadFile: jest.fn(),
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

const REMINDER =
  "Price, specification and deadline changes require a formal change request. Chat messages do not change the order.";
const chat = (overrides: Record<string, unknown> = {}) => ({
  status: "open",
  closesAt: null,
  participants: ["Client", "Print shop", "GRIDGO"],
  reminder: REMINDER,
  unread: 0,
  contactAttempts: 0,
  ...overrides,
});
const at = (minute: number) => `2026-10-17T04:${String(minute).padStart(2, "0")}:00.000Z`;
const messages = [
  { id: "m1", senderLabel: "Client", body: "Can the red be a little darker?", mine: true, createdAt: at(1), attachments: [] },
  { id: "m2", senderLabel: "Print shop", body: "Yes. Call me on [contact hidden] to confirm.", mine: false, createdAt: at(2), attachments: [] },
  { id: "m3", senderLabel: "GRIDGO", body: "Please keep the conversation here.", mine: false, createdAt: at(3), attachments: [] },
];

beforeEach(() => {
  mockParams = { orderId: "order_1" };
  mockGetShopChat.mockReset();
  useNotifications.setState({ items: [], readIds: [] });
});

it("shows the conversation with only the three labels, the masking said out loud, a report on others' messages and the reminder", async () => {
  mockGetShopChat.mockResolvedValue({ chat: chat(), messages, nextAfter: null });
  await renderScreen(<ShopChatScreen />);

  expect(await screen.findByText("Yes. Call me on [contact hidden] to confirm.")).toBeTruthy();
  expect(mockGetShopChat).toHaveBeenCalledWith("order_1", { after: null });
  expect(screen.getByText(/^Client · /)).toBeTruthy();
  expect(screen.getByText(/^Print shop · /)).toBeTruthy();
  expect(screen.getByText(/^GRIDGO · /)).toBeTruthy();
  expect(screen.getByText("GRIDGO hid contact details in this message.")).toBeTruthy();
  // Two messages from the others, none on the client's own.
  expect(screen.getAllByLabelText("Report this message")).toHaveLength(2);
  expect(screen.getByText(/You appear as Client and the shop as Print shop/)).toBeTruthy();
  expect(screen.getByText(new RegExp(`${REMINDER} If the shop needs to change something`))).toBeTruthy();
  expect(screen.getByPlaceholderText("Write to the print shop")).toBeTruthy();
  expect(screen.getByLabelText("Attach photos or a PDF")).toBeTruthy();
  // Neither side can reach the other outside GRIDGO: no call control at all.
  expect(screen.queryByLabelText(/call/i)).toBeNull();
});

it("invites the first message while the conversation is open and empty", async () => {
  mockGetShopChat.mockResolvedValue({ chat: chat(), messages: [], nextAfter: null });
  await renderScreen(<ShopChatScreen />);

  expect(await screen.findByText("No messages yet")).toBeTruthy();
  expect(screen.getByText(/Ask the print shop about your job/)).toBeTruthy();
  expect(screen.getByPlaceholderText("Write to the print shop")).toBeTruthy();
});

it("keeps a closed conversation readable as the order's record, with no composer", async () => {
  mockGetShopChat.mockResolvedValue({
    chat: chat({ status: "read_only", closesAt: "2026-10-18T04:00:00.000Z" }),
    messages,
    nextAfter: null,
  });
  await renderScreen(<ShopChatScreen />);

  expect(await screen.findByText("Can the red be a little darker?")).toBeTruthy();
  expect(screen.getByText(/This conversation is closed, so no new messages can be sent/)).toBeTruthy();
  expect(screen.queryByPlaceholderText("Write to the print shop")).toBeNull();
  expect(screen.queryByLabelText("Attach photos or a PDF")).toBeNull();
  // Reports still work after closing.
  expect(screen.getAllByLabelText("Report this message")).toHaveLength(2);
  expect(screen.getByText("Back to the order")).toBeTruthy();
});

it("says the shop has not accepted yet, with nothing to write in", async () => {
  mockGetShopChat.mockResolvedValue({ chat: chat({ status: "unavailable" }), messages: [], nextAfter: null });
  await renderScreen(<ShopChatScreen />);

  expect(await screen.findByText("The print shop has not accepted yet")).toBeTruthy();
  expect(screen.queryByPlaceholderText("Write to the print shop")).toBeNull();
});

it("shows the warning once the client has repeatedly shared contact details", async () => {
  const warning =
    "Contact details are hidden. Keep communication and payment within GRIDGO. This thread has been flagged for Operations review.";
  mockGetShopChat.mockResolvedValue({ chat: chat({ warning, contactAttempts: 3 }), messages, nextAfter: null });
  await renderScreen(<ShopChatScreen />);

  expect(await screen.findByText(warning)).toBeTruthy();
});

it("reads every page, marks where the new messages start and clears this order's message notices", async () => {
  const markManyRead = jest.fn(() => Promise.resolve());
  useNotifications.setState({
    items: [
      { id: "n1", userId: "u1", type: "client_shop_chat_message", orderId: "order_1", read: false, title: "", body: "", at: at(3) },
      { id: "n2", userId: "u1", type: "client_shop_chat_message", orderId: "order_2", read: false, title: "", body: "", at: at(3) },
    ] as never,
    readIds: [],
    markManyRead,
  });
  mockGetShopChat
    .mockResolvedValueOnce({ chat: chat({ unread: 2 }), messages: messages.slice(0, 2), nextAfter: "m2" })
    .mockResolvedValueOnce({ chat: chat({ unread: 1 }), messages: messages.slice(2), nextAfter: null });
  await renderScreen(<ShopChatScreen />);

  expect(await screen.findByText("Please keep the conversation here.")).toBeTruthy();
  expect(mockGetShopChat).toHaveBeenNthCalledWith(2, "order_1", { after: "m2" });
  expect(screen.getByLabelText("New messages")).toBeTruthy();
  expect(markManyRead).toHaveBeenCalledWith(["n1"]);
});

it("opens a sent PDF from its row, and a photo inline", async () => {
  mockGetFileDownloadUrl.mockResolvedValue({ url: "https://files.example.invalid/image.png" });
  mockGetShopChat.mockResolvedValue({
    chat: chat(),
    messages: [
      {
        id: "m4",
        senderLabel: "Print shop",
        body: "",
        mine: false,
        createdAt: at(4),
        attachments: [
          { fileId: "file_pdf", contentType: "application/pdf", size: 1536 * 1024, originalFilename: "document.pdf" },
          { fileId: "file_png", contentType: "image/png", size: 2048, originalFilename: "image.png" },
        ],
      },
    ],
    nextAfter: null,
  });
  await renderScreen(<ShopChatScreen />);

  expect(await screen.findByLabelText("Open PDF, 1.5 MB")).toBeTruthy();
  expect(await screen.findByLabelText("image.png")).toBeTruthy();
  expect(mockGetFileDownloadUrl).toHaveBeenCalledWith("file_png");
});

it("says the conversation is not this client's to read", async () => {
  mockGetShopChat.mockRejectedValue(Object.assign(new Error("forbidden"), { status: 403, body: { error: "forbidden" } }));
  await renderScreen(<ShopChatScreen />);

  expect(await screen.findByText("This conversation is not available")).toBeTruthy();
});

it("asks for an order when opened without one", async () => {
  mockParams = {};
  await renderScreen(<ShopChatScreen />);
  expect(await screen.findByText("No order chosen")).toBeTruthy();
  expect(mockGetShopChat).not.toHaveBeenCalled();
});
