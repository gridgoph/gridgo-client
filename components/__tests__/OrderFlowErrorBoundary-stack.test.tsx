import { act, render, screen } from "@testing-library/react-native";
import { Try } from "expo-router/build/views/Try";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { OrderFlowErrorBoundary } from "@/components/OrderFlowErrorBoundary";

jest.mock("expo-router", () => ({
  useRouter: () => ({ dismissTo: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));

/**
 * On a phone, React Native's root error handler puts React's component stack
 * on the caught error during the commit — after the recovery screen has
 * first drawn. The screen reads it again then, so it still says where.
 */

const error = new TypeError("Cannot read property 'label' of undefined");
function Broken(): never {
  throw error;
}

it("names where it broke once the component stack arrives after the first draw", async () => {
  jest.useFakeTimers();
  const consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
  await render(
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
  expect(screen.getByText("TypeError")).toBeTruthy();

  Object.assign(error, { componentStack: "\n    at OptionGroupPicker (index.bundle:1:2)\n    at View\n    at ListingScreen" });
  await act(async () => {
    jest.runOnlyPendingTimers();
  });

  expect(screen.getByText("TypeError in OptionGroupPicker, inside ListingScreen")).toBeTruthy();
  consoleError.mockRestore();
  jest.useRealTimers();
});
