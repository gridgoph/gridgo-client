import { fireEvent, render, screen } from "@testing-library/react-native";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Try } from "expo-router/build/views/Try";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ORDER_FLOW_CRASH_TITLE, OrderFlowErrorBoundary } from "@/components/OrderFlowErrorBoundary";

const mockDismissTo = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ dismissTo: mockDismissTo }) }));

/**
 * A step of a new order that throws while drawing must leave the client a way
 * on, not close the app. Drawn through expo-router's own `Try`, which is what
 * wraps a route that exports `ErrorBoundary`.
 */

function Broken(): never {
  throw new Error("Cannot read property 'label' of undefined");
}

async function renderCrashed() {
  return render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 47, left: 0, right: 0, bottom: 34 },
      }}
    >
      <Try catch={OrderFlowErrorBoundary}>
        <Broken />
      </Try>
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
    expect(screen.getByText("Cannot read property 'label' of undefined")).toBeTruthy();
    expect(screen.getByText("Try again")).toBeTruthy();
    expect(screen.getByText("Go back to Home")).toBeTruthy();
  });

  it("writes the error to the device log", async () => {
    await renderCrashed();
    expect(consoleError).toHaveBeenCalledWith(
      "[order-flow] a step crashed while drawing:",
      expect.objectContaining({ message: "Cannot read property 'label' of undefined" }),
    );
  });

  it("is the error boundary of every order-flow step", () => {
    const dir = join(__dirname, "../../app/request");
    const steps = ["category", "[category]", "when", "fulfilment", "rank", "where", "match", "add-more", "listing", "artwork"];
    const present = new Set(readdirSync(dir));
    for (const step of steps) {
      expect(present.has(`${step}.tsx`)).toBe(true);
      const source = readFileSync(join(dir, `${step}.tsx`), "utf8");
      expect(source).toContain(
        'export { OrderFlowErrorBoundary as ErrorBoundary } from "@/components/OrderFlowErrorBoundary";',
      );
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
