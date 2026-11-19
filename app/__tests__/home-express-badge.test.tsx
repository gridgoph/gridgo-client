import { fireEvent, screen } from "@testing-library/react-native";

import HomeScreen from "@/app/(tabs)/home";
import { renderScreen } from "@/test/renderScreen";
import { resetExpressHome } from "@/test/expressHomeHarness";

const mockPush = jest.fn();

jest.mock("expo-router", () => jest.requireActual("@/test/expressHomeHarness").expressHomeRouter((href: unknown) => mockPush(href)));
jest.mock("@/lib/api", () => jest.requireActual("@/test/expressHomeHarness").expressHomeApiMock());

beforeEach(() => {
  mockPush.mockClear();
  resetExpressHome({ showPopup: false });
});

// client#441: the ⚡ badge sits on Docs only, and opens Express; the circle still opens the family.
it("opens Express Files from the Docs badge", async () => {
  await renderScreen(<HomeScreen />);

  const badges = await screen.findAllByTestId("express-badge");
  expect(badges).toHaveLength(1);
  fireEvent.press(screen.getByLabelText("Express documents"));
  expect(mockPush).toHaveBeenCalledWith("/express");
});
