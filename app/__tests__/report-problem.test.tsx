import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import ReportProblemScreen from "@/app/report-problem";
import { BUG_REPORT_HEADING } from "@/lib/bugReport";

const mockReplace = jest.fn();
let mockParams: { orderId?: string } = {};

jest.mock("expo-router", () => ({
  useRouter: () => ({ replace: mockReplace, back: jest.fn(), push: jest.fn() }),
  useLocalSearchParams: () => mockParams,
}));

jest.mock("expo-router/react-navigation", () => ({ usePreventRemove: jest.fn() }));

jest.mock("@/lib/bugReport", () => ({
  ...jest.requireActual("@/lib/bugReport"),
  currentDevice: () => ({
    app: "GRIDGO Client 1.0.42",
    phone: "Samsung SM-A546E",
    system: "Android 14",
  }),
}));

jest.mock("@/lib/api", () => {
  const actual = jest.requireActual("@/lib/api");
  return { ...actual, listOrders: jest.fn(), sendSupportChatMessage: jest.fn() };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require("@/lib/api");

const THREAD_ID = "2c1b0a9e-8d7c-4b3a-9f10-1234567890ab";

const ORDER = {
  id: "ord_3ff0128e105a",
  title: "Tarpaulin 3x6",
  state: "needs_qa",
  fulfillmentMode: "delivery",
  createdAt: "2026-09-20T00:00:00.000Z",
  updatedAt: "2026-09-23T00:00:00.000Z",
};

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
  mockReplace.mockClear();
  api.listOrders.mockReset();
  api.listOrders.mockResolvedValue([ORDER]);
  api.sendSupportChatMessage.mockReset();
  api.sendSupportChatMessage.mockResolvedValue({
    thread: { id: THREAD_ID },
    message: { id: "msg_1" },
  });
});

/* One press per file-ending test — see "Running and testing" in AGENTS.md. */
describe("Report a problem", () => {
  it("shows what goes with the report before anything is sent", async () => {
    mockParams = {};
    await renderInSafeArea(<ReportProblemScreen />);

    expect(screen.getByLabelText("What happened")).toBeTruthy();
    expect(screen.getByLabelText("What you expected")).toBeTruthy();
    expect(screen.getByText("GRIDGO Client 1.0.42")).toBeTruthy();
    expect(screen.getByText("Samsung SM-A546E")).toBeTruthy();
    expect(screen.getByText("Android 14")).toBeTruthy();
    // The order field waits for the list, then offers it, defaulting to none.
    await waitFor(() =>
      expect(screen.getByLabelText("Which order").props.accessibilityState.disabled).toBe(false),
    );
    expect(screen.getByText("Not about an order")).toBeTruthy();
    expect(api.sendSupportChatMessage).not.toHaveBeenCalled();
  });

  it("sends a marked report into a new conversation and opens it", async () => {
    mockParams = { orderId: ORDER.id };
    await renderInSafeArea(<ReportProblemScreen />);
    await waitFor(() => expect(screen.getByText("Tarpaulin 3x6")).toBeTruthy());

    fireEvent.changeText(
      screen.getByLabelText("What happened"),
      "I tapped Pay and the screen went blank.",
    );
    await waitFor(() =>
      expect(screen.getByLabelText("What happened").props.value).toBe(
        "I tapped Pay and the screen went blank.",
      ),
    );
    fireEvent.press(screen.getByText("Send to Operations"));

    await waitFor(() => expect(api.sendSupportChatMessage).toHaveBeenCalledTimes(1));
    const [body, threadId, options] = api.sendSupportChatMessage.mock.calls[0];
    expect(threadId).toBeUndefined();
    expect(options).toEqual({ newThread: true });
    expect(body.split("\n")[0]).toBe(BUG_REPORT_HEADING);
    expect(body).toContain("I tapped Pay and the screen went blank.");
    expect(body).toContain("Order: 3FF0-128E-105A, Tarpaulin 3x6 (In artwork check)");
    expect(body).toContain("App: GRIDGO Client 1.0.42");
    expect(body).toContain("System: Android 14");

    await waitFor(() =>
      expect(mockReplace).toHaveBeenCalledWith({
        pathname: "/chat/[thread]",
        params: { thread: THREAD_ID },
      }),
    );
  });
});
