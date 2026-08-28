import { fireEvent, render, screen } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import ChatListScreen from "@/app/chat/index";
import ChatThreadScreen from "@/app/chat/[thread]";
import { CHAT_NOT_LIVE } from "@/lib/chatThreads";

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
  // Wrapped rather than passed by reference: `jest.mock` is hoisted above the
  // `const` below, so the factory runs before `mockStackScreen` is assigned.
  Stack: { Screen: (props: { options?: unknown }) => mockStackScreen(props) },
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
});

describe("the chat list", () => {
  it("names all three counterparties and when each one starts", async () => {
    await renderInSafeArea(<ChatListScreen />);

    expect(screen.getByText("Supplier")).toBeTruthy();
    expect(screen.getByText("Rider")).toBeTruthy();
    expect(screen.getByText("Gridbot")).toBeTruthy();
    expect(screen.getByText("Opens once a shop takes your job")).toBeTruthy();
    expect(screen.getByText("Opens once your job is out for delivery")).toBeTruthy();
  });

  it("says messaging is not live rather than letting the client wait", async () => {
    await renderInSafeArea(<ChatListScreen />);

    expect(screen.getByText(CHAT_NOT_LIVE)).toBeTruthy();
  });

  it("opens a thread", async () => {
    await renderInSafeArea(<ChatListScreen />);

    fireEvent.press(screen.getByLabelText("Rider"));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/chat/[thread]",
      params: { thread: "rider" },
    });
  });
});

describe("a chat thread", () => {
  it("shows an empty state, never a transcript", async () => {
    mockParams = { thread: "supplier" };
    await renderInSafeArea(<ChatThreadScreen />);

    expect(screen.getByText("Supplier")).toBeTruthy();
    expect(screen.getByText("No messages yet")).toBeTruthy();
    expect(screen.getByText(CHAT_NOT_LIVE)).toBeTruthy();
  });

  it("grows its own way out when a deep link left no history behind it", async () => {
    // The native stack hides its back control with an empty history, and this
    // is not a tab, so without a headerLeft the client would have only OS
    // gestures. Nothing is overridden when there is somewhere to go back to.
    mockCanGoBack = false;
    mockParams = { thread: "gridbot" };
    await renderInSafeArea(<ChatThreadScreen />);

    expect(mockStackScreen).toHaveBeenCalled();
    const options = mockStackScreen.mock.calls[0]?.[0].options as
      | { headerLeft?: () => unknown }
      | undefined;
    expect(typeof options?.headerLeft).toBe("function");
  });

  it("leaves the platform back alone when there is history", async () => {
    mockParams = { thread: "gridbot" };
    await renderInSafeArea(<ChatThreadScreen />);

    expect(mockStackScreen).not.toHaveBeenCalled();
  });

  it("answers an unknown thread instead of rendering a blank one", async () => {
    mockParams = { thread: "ops" };
    await renderInSafeArea(<ChatThreadScreen />);

    expect(screen.getByText("No such conversation")).toBeTruthy();

    fireEvent.press(screen.getByText("See all three"));
    expect(mockReplace).toHaveBeenCalledWith("/chat");
  });
});
