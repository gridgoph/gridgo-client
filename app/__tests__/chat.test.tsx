import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import ChatListScreen from "@/app/chat/index";
import ChatThreadScreen from "@/app/chat/[thread]";

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockStackScreen = jest.fn((_props: { options?: unknown }) => null);
let mockParams: { thread?: string } = {};
let mockCanGoBack = true;

jest.mock("expo-router", () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    back: jest.fn(),
    canGoBack: () => mockCanGoBack,
  }),
  useLocalSearchParams: () => mockParams,
  Stack: { Screen: (props: { options?: unknown }) => mockStackScreen(props) },
}));

jest.mock("react-native-keyboard-controller", () => {
  const { View } = require("react-native");
  return { KeyboardAvoidingView: View };
});

const mockGetSupportChatMe = jest.fn(async () => ({ thread: null, messages: [] }));
const mockSendSupportChatMessage = jest.fn();
const mockMarkSupportChatRead = jest.fn(async () => ({ thread: null }));

jest.mock("@/lib/api", () => ({
  getSupportChatMe: (...args: unknown[]) => mockGetSupportChatMe(...args),
  sendSupportChatMessage: (...args: unknown[]) => mockSendSupportChatMessage(...args),
  markSupportChatRead: (...args: unknown[]) => mockMarkSupportChatRead(...args),
}));

jest.mock("@/lib/supportChatStream", () => ({
  openSupportChatStream: () => ({ close: jest.fn() }),
}));

function renderInSafeArea(ui: ReactElement) {
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

beforeEach(() => {
  mockPush.mockClear();
  mockReplace.mockClear();
  mockStackScreen.mockClear();
  mockParams = {};
  mockCanGoBack = true;
  mockGetSupportChatMe.mockResolvedValue({ thread: null, messages: [] });
});

describe("the Operations conversation", () => {
  it("opens the desk rather than the retired supplier, rider and Gridbot rows", async () => {
    await renderInSafeArea(<ChatListScreen />);

    expect(await screen.findByText("Operations")).toBeTruthy();
    expect(screen.getByText("GRIDGO operations")).toBeTruthy();
    expect(screen.getByText("No messages yet")).toBeTruthy();
    expect(screen.queryByText("Supplier")).toBeNull();
    expect(screen.queryByText("Rider")).toBeNull();
    expect(screen.queryByText("Gridbot")).toBeNull();
    expect(screen.getByLabelText("Message Operations")).toBeTruthy();
    expect(screen.getByLabelText("Send")).toBeTruthy();
  });

  it("sends a message to Operations", async () => {
    mockSendSupportChatMessage.mockResolvedValue({
      thread: { id: "t1", unreadCount: 0 },
      message: {
        id: "m1",
        threadId: "t1",
        senderUserId: "me",
        senderRole: "client",
        body: "Need a reprint.",
        createdAt: "2026-09-20T03:00:00.000Z",
        mine: true,
      },
    });
    await renderInSafeArea(<ChatListScreen />);
    await screen.findByText("Operations");

    fireEvent.changeText(screen.getByPlaceholderText("Write to Operations"), "Need a reprint.");
    await screen.findByDisplayValue("Need a reprint.");
    fireEvent.press(screen.getByLabelText("Send"));

    await waitFor(() => {
      expect(mockSendSupportChatMessage).toHaveBeenCalledWith("Need a reprint.");
    });
    expect(await screen.findByText("Need a reprint.")).toBeTruthy();
  });
});

describe("a chat thread route", () => {
  it("renders Operations when the peer is ops", async () => {
    mockParams = { thread: "ops" };
    await renderInSafeArea(<ChatThreadScreen />);
    expect(await screen.findByText("Operations")).toBeTruthy();
    expect(screen.getByLabelText("Message Operations")).toBeTruthy();
  });

  it("grows its own way out when a deep link left no history behind it", async () => {
    mockCanGoBack = false;
    mockParams = { thread: "ops" };
    await renderInSafeArea(<ChatThreadScreen />);
    expect(mockStackScreen).toHaveBeenCalled();
    const options = mockStackScreen.mock.calls[0]?.[0].options as
      | { headerLeft?: () => unknown }
      | undefined;
    expect(typeof options?.headerLeft).toBe("function");
  });

  it("leaves the platform back alone when there is history", async () => {
    mockParams = { thread: "ops" };
    await renderInSafeArea(<ChatThreadScreen />);
    await screen.findByText("Operations");
    expect(mockStackScreen).not.toHaveBeenCalled();
  });

  it("answers a retired placeholder instead of rendering a blank one", async () => {
    mockParams = { thread: "supplier" };
    await renderInSafeArea(<ChatThreadScreen />);

    expect(screen.getByText("No such conversation")).toBeTruthy();
    fireEvent.press(screen.getByText("Open Operations"));
    expect(mockReplace).toHaveBeenCalledWith("/chat");
  });
});
