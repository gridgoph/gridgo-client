import { fireEvent, screen, waitFor } from "@testing-library/react-native";

import HomeScreen from "@/app/(tabs)/home";
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

/* The reported bug: Home's tile opened the retired form, seeded with the order. */
it("takes Home's Reorder tile into the current flow with the job carried", async () => {
  await renderScreen(<HomeScreen />);

  fireEvent.press(await screen.findByLabelText("Reorder Flyers"));

  await waitFor(() => expect(mockPush).toHaveBeenCalled());
  expectCurrentFlowFlyers(mockPush);
});
