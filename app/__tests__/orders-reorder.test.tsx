import { fireEvent, screen, waitFor } from "@testing-library/react-native";

import OrdersScreen from "@/app/(tabs)/orders";
import { expectCurrentFlowFlyers, resetReorder } from "@/test/reorderFixtures";
import { renderScreen } from "@/test/renderScreen";

const mockPush = jest.fn();

jest.mock("expo-router", () =>
  jest.requireActual("@/test/reorderFixtures").reorderRouter((href: unknown) => mockPush(href)),
);
jest.mock("@/lib/api", () => jest.requireActual("@/test/reorderFixtures").reorderApiMock());

beforeEach(() => {
  mockPush.mockClear();
  resetReorder();
});

it("takes the Orders tab's Reorder into the current flow with the job carried", async () => {
  await renderScreen(<OrdersScreen />);

  fireEvent.press(await screen.findByLabelText("Reorder Flyers"));

  await waitFor(() => expect(mockPush).toHaveBeenCalled());
  expectCurrentFlowFlyers(mockPush);
});
