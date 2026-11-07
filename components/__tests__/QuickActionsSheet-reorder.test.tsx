import { fireEvent, screen, waitFor } from "@testing-library/react-native";

import { useQuickActions } from "@/store/quickActions";
import { renderQuickActions, setUpQuickActions } from "@/test/quickActionsHarness";
import { expectCurrentFlowFlyers, resetReorder } from "@/test/reorderFixtures";

const mockPush = jest.fn();

jest.mock("expo-router", () =>
  jest.requireActual("@/test/reorderFixtures").reorderRouter((href: unknown) => mockPush(href)),
);
jest.mock("@/lib/api", () => jest.requireActual("@/test/reorderFixtures").reorderApiMock());

beforeEach(() => {
  mockPush.mockClear();
  resetReorder();
  setUpQuickActions();
});

it("takes the + sheet's Reorder into the current flow with the job carried", async () => {
  await renderQuickActions();

  fireEvent.press(await screen.findByLabelText(/^Reorder/));

  await waitFor(() => expect(mockPush).toHaveBeenCalled(), { timeout: 3000 });
  expect(useQuickActions.getState().open).toBe(false);
  expectCurrentFlowFlyers(mockPush);
});
