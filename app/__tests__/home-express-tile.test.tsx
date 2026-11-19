import { fireEvent, screen } from "@testing-library/react-native";

import HomeScreen from "@/app/(tabs)/home";
import { renderScreen } from "@/test/renderScreen";
import { resetExpressHome } from "@/test/expressHomeHarness";

const mockPush = jest.fn();

jest.mock("expo-router", () => jest.requireActual("@/test/expressHomeHarness").expressHomeRouter((href: unknown) => mockPush(href)));
jest.mock("@/lib/api", () => jest.requireActual("@/test/expressHomeHarness").expressHomeApiMock());

beforeEach(() => {
  mockPush.mockClear();
  // No popup in the way: today's is already shown.
  resetExpressHome({ showPopup: false });
});

// client#441: the yellow Express tile took Reorder's place.
it("opens Express Files from the yellow tile, and Reorder is gone", async () => {
  await renderScreen(<HomeScreen />);

  expect(screen.queryByTestId("reorder-tile")).toBeNull();
  expect(await screen.findByText("Print your docs now")).toBeTruthy();
  expect(screen.getByText("Skip the line →")).toBeTruthy();
  fireEvent.press(screen.getByLabelText("Express. Print your docs now"));
  expect(mockPush).toHaveBeenCalledWith("/express");
});
