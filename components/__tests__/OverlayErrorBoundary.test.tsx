import { render, screen } from "@testing-library/react-native";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Text, View } from "react-native";

import { OverlayErrorBoundary } from "@/components/OverlayErrorBoundary";

/**
 * The root layout draws its prompts beside the navigator, outside every
 * route's error boundary. One that throws must hide itself, not the app.
 */

// An invented marker, never a real credential.
function BrokenTour(): never {
  throw new Error("Set your specs card failed Authorization: Bearer FAKE_OVERLAY_BEARER");
}

let consoleError: jest.SpyInstance;
beforeEach(() => {
  consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => consoleError.mockRestore());

describe("OverlayErrorBoundary", () => {
  it("hides only the overlay that threw and leaves the screen under it", async () => {
    await render(
      <View>
        <Text>The order sheet</Text>
        <OverlayErrorBoundary name="tour">
          <BrokenTour />
        </OverlayErrorBoundary>
        <OverlayErrorBoundary name="checkout-exit">
          <Text>What stopped you from ordering?</Text>
        </OverlayErrorBoundary>
      </View>,
    );
    expect(screen.getByText("The order sheet")).toBeTruthy();
    expect(screen.getByText("What stopped you from ordering?")).toBeTruthy();
    expect(screen.queryByText(/Set your specs/)).toBeNull();
  });

  it("logs which overlay failed, redacted", async () => {
    await render(
      <OverlayErrorBoundary name="tour">
        <BrokenTour />
      </OverlayErrorBoundary>,
    );
    // Ours only: React Native's ExceptionsManager reports the raw error itself.
    const ours = consoleError.mock.calls
      .map((call) => call.map(String).join(" "))
      .filter((line) => line.startsWith("[overlay:"));
    expect(ours).toHaveLength(1);
    expect(ours[0]).toMatch(
      /^\[overlay:tour\] hidden after it crashed while drawing: Error: Set your specs card failed Authorization: \[redacted\]/,
    );
    expect(ours[0]).not.toContain("FAKE_OVERLAY_BEARER");
  });

  it("wraps every prompt the root layout draws over the screens", () => {
    const layout = readFileSync(join(__dirname, "../../app/_layout.tsx"), "utf8");
    const overlays = [
      "ReceiptOcrHost",
      "AppUpdateSheet",
      "PushExplainerSheet",
      "PromotionClaimSheet",
      "TourOverlay",
      "CheckoutExitQuestion",
      "FoundingTesterCelebration",
      "CallOverlay",
    ];
    for (const overlay of overlays) {
      expect(layout).toMatch(new RegExp(`<OverlayErrorBoundary name="[a-z-]+">\\s*<${overlay}[\\s/>]`));
    }
  });
});
