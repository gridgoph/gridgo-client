import { fireEvent, render, screen, within } from "@testing-library/react-native";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Try } from "expo-router/build/views/Try";
import type { ReactElement } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ORDER_FLOW_CRASH_TITLE, OrderFlowErrorBoundary } from "@/components/OrderFlowErrorBoundary";

const mockDismissTo = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ dismissTo: mockDismissTo }),
  useLocalSearchParams: () => ({}),
}));

/**
 * A step of a new order that throws while drawing must leave the client a way
 * on, not close the app. Drawn through expo-router's own `Try`, which is what
 * wraps a route that exports `ErrorBoundary`.
 */

function Broken(): never {
  throw new TypeError("Cannot read property 'label' of undefined");
}

// Invented markers, never real credentials.
function Leaky(): never {
  throw new Error(
    "Image failed https://files.example.invalid/sample?X-Amz-Signature=FAKE_REVIEW_SIGNATURE Authorization: Bearer FAKE_REVIEW_BEARER",
  );
}

function Wordy(): never {
  throw new Error("The listing could not be drawn because ".repeat(200));
}

async function renderCrashed(child: ReactElement = <Broken />) {
  return render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 47, left: 0, right: 0, bottom: 34 },
      }}
    >
      <Try catch={OrderFlowErrorBoundary}>{child}</Try>
    </SafeAreaProvider>,
  );
}

let consoleError: jest.SpyInstance;
beforeEach(() => {
  consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => consoleError.mockRestore());

describe("OrderFlowErrorBoundary", () => {
  it("says something went wrong and names the error, so a screenshot carries the cause", async () => {
    await renderCrashed();
    expect(screen.getByText(ORDER_FLOW_CRASH_TITLE)).toBeTruthy();
    expect(screen.getByText("TypeError: Cannot read property 'label' of undefined")).toBeTruthy();
    expect(screen.getByText("Try again")).toBeTruthy();
    expect(screen.getByText("Go back to Home")).toBeTruthy();
  });

  it("writes the error to the device log", async () => {
    await renderCrashed();
    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining(
        "[order-flow] a step crashed while drawing: TypeError: Cannot read property 'label' of undefined",
      ),
    );
  });

  it("never shows or logs a signed link's query or a bearer token", async () => {
    await renderCrashed(<Leaky />);
    expect(screen.getByText(/Image failed https:\/\/files\.example\.invalid\/sample\?\[redacted\]/)).toBeTruthy();
    expect(screen.queryByText(/FAKE_REVIEW_BEARER|FAKE_REVIEW_SIGNATURE/)).toBeNull();
    // Ours only: React Native's ExceptionsManager reports the raw error itself.
    const logged = consoleError.mock.calls
      .map((call) => call.map(String).join(" "))
      .filter((line) => line.startsWith("[order-flow]"))
      .join("\n");
    expect(logged).toContain("[order-flow] a step crashed while drawing: Error: Image failed");
    expect(logged).not.toMatch(/FAKE_REVIEW_BEARER|FAKE_REVIEW_SIGNATURE/);
  });

  it("bounds a long message and keeps both ways out in a scroll", async () => {
    await renderCrashed(<Wordy />);
    const detail = screen.getByText(/^Error: The listing could not be drawn/);
    expect(String(detail.props.children).length).toBeLessThanOrEqual(300);
    const scroll = screen.getByTestId("order-flow-crash");
    expect(within(scroll).getByText("Try again")).toBeTruthy();
    expect(within(scroll).getByText("Go back to Home")).toBeTruthy();
  });

  it("is the error boundary of every order-flow step", () => {
    const dir = join(__dirname, "../../app/request");
    const steps = ["category", "[category]", "when", "fulfilment", "rank", "where", "match", "add-more", "listing", "artwork"];
    const present = new Set(readdirSync(dir));
    for (const step of steps) {
      expect(present.has(`${step}.tsx`)).toBe(true);
      const source = readFileSync(join(dir, `${step}.tsx`), "utf8");
      // The listing's own boundary reads the sheet again before retrying.
      const boundary = step === "listing" ? "ListingErrorBoundary" : "OrderFlowErrorBoundary";
      expect(source).toContain(`export { ${boundary} as ErrorBoundary } from "@/components/OrderFlowErrorBoundary";`);
    }
  });

  // Press last: a later render in this file after one comes back empty
  // (see AGENTS.md on @testing-library/react-native 14 under React 19).
  it("goes back to Home without leaving through a replace", async () => {
    await renderCrashed();
    fireEvent.press(screen.getByText("Go back to Home"));
    expect(mockDismissTo).toHaveBeenCalledWith("/(tabs)/home");
  });
});
