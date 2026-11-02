import { fireEvent, screen, waitFor } from "@testing-library/react-native";

import { useQuickActions } from "@/store/quickActions";
import { renderQuickActions, setUpQuickActions } from "@/test/quickActionsHarness";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
  router: { push: mockPush, replace: jest.fn(), back: jest.fn() },
}));
jest.mock("@/lib/api", () => jest.requireActual("@/test/quickActionsApiMock").quickActionsApiMock());

it("closes from the dimmed screen behind it", async () => {
  setUpQuickActions();
  await renderQuickActions();
  expect(await screen.findByTestId("quick-actions-sheet")).toBeTruthy();

  // The dim fades in with the slide, so it is drawn at opacity 0 on the first frame.
  fireEvent.press(screen.getByTestId("quick-actions-scrim", { includeHiddenElements: true }));

  await waitFor(() => expect(useQuickActions.getState().open).toBe(false));
  await waitFor(() => expect(screen.queryByTestId("quick-actions-sheet")).toBeNull());
  expect(mockPush).not.toHaveBeenCalled();
});
