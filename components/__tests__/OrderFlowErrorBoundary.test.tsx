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

/**
 * What React Native's root error handler leaves on a caught error: React's
 * component stack, frames with bundle locations (one carrying an invented
 * token) and framework components between the app's own.
 */
const COMPONENT_STACK = [
  "",
  "    at OptionGroupPicker (http://10.0.2.2:8081/index.bundle?platform=android&token=FAKE_STACK_TOKEN:120:15)",
  "    at View (unknown)",
  "    at RCTView",
  "    at ListingScreen (http://10.0.2.2:8081/index.bundle?platform=android:900:3)",
  "    at Try (http://10.0.2.2:8081/index.bundle:10:1)",
  "    at SceneView",
].join("\n");

function onComponentStack<T extends Error>(error: T): T {
  return Object.assign(error, { componentStack: COMPONENT_STACK });
}

function throwing(value: unknown) {
  return function Broken(): never {
    throw value;
  };
}

const Broken = throwing(onComponentStack(new TypeError("Cannot read property 'label' of undefined")));

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

function ourLog(spy: jest.SpyInstance): string {
  // Ours only: React Native's ExceptionsManager reports the raw error itself.
  return spy.mock.calls
    .map((call) => call.map(String).join(" "))
    .filter((line) => line.startsWith("[order-flow]"))
    .join("\n");
}

let consoleError: jest.SpyInstance;
beforeEach(() => {
  consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => consoleError.mockRestore());

/** Every input the reviews showed leaking through a message (invented markers only). */
const LEAKS: { label: string; thrown: unknown; headline: string }[] = [
  {
    label: "a signed link and a bearer token",
    thrown: onComponentStack(
      new Error(
        "Image failed https://files.example.invalid/sample?X-Amz-Signature=FAKE_REVIEW_SIGNATURE Authorization: Bearer FAKE_REVIEW_BEARER",
      ),
    ),
    headline: "Error in OptionGroupPicker, inside ListingScreen",
  },
  {
    label: "JSON, single-quoted and later-cookie credentials",
    thrown: onComponentStack(
      new Error(
        'Request failed {"token":"FAKE_JSON_TOKEN","password":"FAKE_JSON_PASSWORD"} ' +
          "secret='FAKE_SINGLE_SECRET' Cookie: theme=light; sid=FAKE_SECOND_COOKIE",
      ),
    ),
    headline: "Error in OptionGroupPicker, inside ListingScreen",
  },
  {
    label: "double-encoded JSON whose credential holds quotes",
    thrown: onComponentStack(
      new Error("API said " + JSON.stringify(JSON.stringify({ password: 'prefix "REVIEW_FAKE_SECRET" tail' }))),
    ),
    headline: "Error in OptionGroupPicker, inside ListingScreen",
  },
  {
    label: "a JSON message with a credential inside another object",
    thrown: onComponentStack(new RangeError(JSON.stringify({ credentials: { nested: { pin: "REVIEW_FAKE_SECRET" } } }))),
    headline: "RangeError in OptionGroupPicker, inside ListingScreen",
  },
  {
    // React Native puts the component stack on its own wrapper, not on a thrown object.
    label: "a thrown object with a dotted credential key",
    thrown: { "password.v2": "REVIEW_FAKE_SECRET" },
    headline: "Thrown value",
  },
  {
    label: "a long message",
    thrown: onComponentStack(new Error("The listing could not be drawn because ".repeat(200))),
    headline: "Error in OptionGroupPicker, inside ListingScreen",
  },
];

const SECRETS = /FAKE_|REVIEW_FAKE|redacted|index\.bundle|could not be drawn|Request failed|API said|Image failed/;

describe("OrderFlowErrorBoundary", () => {
  it("says something went wrong, with the error's type and where it broke", async () => {
    await renderCrashed();
    expect(screen.getByText(ORDER_FLOW_CRASH_TITLE)).toBeTruthy();
    expect(screen.getByText("TypeError in OptionGroupPicker, inside ListingScreen")).toBeTruthy();
    expect(screen.queryByText(/Cannot read property/)).toBeNull();
    expect(screen.getByText("Try again")).toBeTruthy();
    expect(screen.getByText("Go back to Home")).toBeTruthy();
  });

  it("names the type alone when there is no component stack (web)", async () => {
    const NoStack = throwing(new TypeError("no stack here"));
    await renderCrashed(<NoStack />);
    expect(screen.getByText("TypeError")).toBeTruthy();
    expect(screen.queryByText(/no stack here/)).toBeNull();
  });

  it.each(LEAKS)("never shows the message of $label", async ({ thrown, headline }) => {
    const Throwing = throwing(thrown);
    await renderCrashed(<Throwing />);
    expect(screen.getByText(headline)).toBeTruthy();
    expect(screen.queryByText(SECRETS)).toBeNull();
    const scroll = screen.getByTestId("order-flow-crash");
    expect(within(scroll).getByText("Try again")).toBeTruthy();
    expect(within(scroll).getByText("Go back to Home")).toBeTruthy();
  });

  it("writes the redacted message, stack and component stack to the device log", async () => {
    await renderCrashed();
    const logged = ourLog(consoleError);
    expect(logged).toContain(
      "[order-flow] a step crashed while drawing: TypeError: Cannot read property 'label' of undefined",
    );
    expect(logged).toContain("Component stack:");
    expect(logged).toContain("at ListingScreen (http://10.0.2.2:8081/index.bundle?[redacted]");
    expect(logged).not.toContain("FAKE_STACK_TOKEN");
  });

  it("keeps the redaction in the device log for a signed link and JSON credentials", async () => {
    const Throwing = throwing(LEAKS[1].thrown);
    await renderCrashed(<Throwing />);
    const logged = ourLog(consoleError);
    expect(logged).toContain('[order-flow] a step crashed while drawing: Error: Request failed {"token":"[redacted]"');
    expect(logged).not.toMatch(/FAKE_JSON_TOKEN|FAKE_JSON_PASSWORD|FAKE_SINGLE_SECRET|FAKE_SECOND_COOKIE/);
  });

  it("is the error boundary of every order-flow step", () => {
    const dir = join(__dirname, "../../app/request");
    const steps = ["category", "[category]", "when", "fulfilment", "rank", "where", "match", "add-more", "listing", "artwork"];
    const present = new Set(readdirSync(dir));
    for (const step of steps) {
      expect(present.has(`${step}.tsx`)).toBe(true);
      const source = readFileSync(join(dir, `${step}.tsx`), "utf8");
      // The listing's and the artwork's own boundaries read the listing again before retrying.
      const boundary =
        step === "listing" ? "ListingErrorBoundary" : step === "artwork" ? "ArtworkErrorBoundary" : "OrderFlowErrorBoundary";
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
