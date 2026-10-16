import { fireEvent, render, screen } from "@testing-library/react-native";

import RequestChangesSheet from "@/app/order/request-changes";

const mockBack = jest.fn();

jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ orderId: "ord_1" }),
  useRouter: () => ({ back: mockBack }),
}));
jest.mock("expo-router/react-navigation", () => ({ usePreventRemove: jest.fn() }));
jest.mock("react-native-safe-area-context", () => ({
  ...jest.requireActual("react-native-safe-area-context"),
  useSafeAreaInsets: () => ({ top: 59, right: 0, bottom: 34, left: 0 }),
}));

// The jest preset runs as iOS, where the route is a transparent modal and the
// screen draws its own sheet surface down to the screen edge.
it("draws an iPhone sheet surface to the screen bottom, inset inside it, over a scrim that closes it", async () => {
  await render(<RequestChangesSheet />);

  expect(screen.getByTestId("request-changes-surface")).toHaveStyle({ paddingBottom: 42 });

  // Outside the modal surface, so screen readers close it with Cancel instead.
  fireEvent.press(screen.getByLabelText("Close", { includeHiddenElements: true }));
  expect(mockBack).toHaveBeenCalledTimes(1);
});
