import { fireEvent, render, screen } from "@testing-library/react-native";
import { Try } from "expo-router/build/views/Try";
import { Text } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { OrderFlowErrorBoundary } from "@/components/OrderFlowErrorBoundary";

jest.mock("expo-router", () => ({ useRouter: () => ({ dismissTo: jest.fn() }) }));

/** "Try again" draws the step afresh: one press per file, so it has its own. */

let failing = true;
function Flaky() {
  if (failing) throw new Error("listing sheet failed");
  return <Text>Choose your options</Text>;
}

it("draws the step again on Try again", async () => {
  const consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
  await render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 47, left: 0, right: 0, bottom: 34 },
      }}
    >
      <Try catch={OrderFlowErrorBoundary}>
        <Flaky />
      </Try>
    </SafeAreaProvider>,
  );
  expect(screen.getByText("listing sheet failed")).toBeTruthy();

  failing = false;
  fireEvent.press(screen.getByText("Try again"));
  expect(await screen.findByText("Choose your options")).toBeTruthy();
  expect(screen.queryByText("listing sheet failed")).toBeNull();
  consoleError.mockRestore();
});
