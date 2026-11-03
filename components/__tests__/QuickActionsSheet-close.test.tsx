import { fireEvent, screen, waitFor } from "@testing-library/react-native";

import { useQuickActions } from "@/store/quickActions";
import { renderQuickActions, setUpQuickActions } from "@/test/quickActionsHarness";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
  router: { push: mockPush, replace: jest.fn(), back: jest.fn() },
}));
jest.mock("@/lib/api", () => jest.requireActual("@/test/quickActionsApiMock").quickActionsApiMock());

it("closes from the close button", async () => {
  setUpQuickActions();
  await renderQuickActions();
  expect(await screen.findByTestId("quick-actions-sheet")).toBeTruthy();

  fireEvent.press(screen.getByTestId("quick-actions-close"));

  await waitFor(() => expect(useQuickActions.getState().open).toBe(false));
  await waitFor(() => expect(screen.queryByTestId("quick-actions-sheet")).toBeNull());
  expect(mockPush).not.toHaveBeenCalled();
});
