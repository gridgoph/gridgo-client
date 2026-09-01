import { render, screen } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import type { ReactElement } from "react";

import RateOrderSheet from "@/app/order/rate";

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({ orderId: "order_1" }),
}));

jest.mock("@react-navigation/native", () => ({ usePreventRemove: jest.fn() }));

const frame = { x: 0, y: 0, width: 390, height: 844 };
const insets = { top: 0, left: 0, right: 0, bottom: 0 };
const wrap = (node: ReactElement) => (
  <SafeAreaProvider initialMetrics={{ frame, insets }}>{node}</SafeAreaProvider>
);

describe("rating a finished order", () => {
  it("asks about quality, speed and value, and never about distance", async () => {
    // GRIDGO chose the shop and the client never saw where it was. A distance
    // question here asks somebody to rate a decision they did not make.
    await render(wrap(<RateOrderSheet />));

    expect(screen.getByText("Quality")).toBeTruthy();
    expect(screen.getByText("Speed")).toBeTruthy();
    expect(screen.getByText("Value")).toBeTruthy();
    expect(screen.queryByText("Distance")).toBeNull();
  });

  it("cannot be sent until all three are answered", async () => {
    // The platform refuses a partial rating, so offering to send one would
    // walk the client into a refusal they cannot act on.
    await render(wrap(<RateOrderSheet />));

    const send = screen.getByText("Send rating");
    expect(send).toBeTruthy();
    expect(screen.getByRole("button", { name: "Send rating" }).props.accessibilityState.disabled)
      .toBe(true);
  });

  it("says what each star would mean, not just how many there are", async () => {
    // Colour and shape alone are not a rating anyone can read back, and this
    // product does not communicate a state by shape alone.
    await render(wrap(<RateOrderSheet />));

    expect(screen.getByLabelText("Quality: 3 stars, About what I expected")).toBeTruthy();
    expect(screen.getByLabelText("Speed: 5 stars, Excellent")).toBeTruthy();

    // The sighted reader gets the same word under the row. It is hidden from
    // the accessibility tree on purpose — the stars already announce it, and
    // announcing it twice is the same news twice on the way through.
    expect(screen.getAllByText("Not rated yet", { includeHiddenElements: true })).toHaveLength(3);
  });

  it("says the comment is optional", async () => {
    // A required box turns a five-tap answer into a writing task, and what
    // comes back is "ok" from everyone who wanted to be finished.
    await render(wrap(<RateOrderSheet />));

    expect(screen.getByText("Optional.")).toBeTruthy();
  });
});
