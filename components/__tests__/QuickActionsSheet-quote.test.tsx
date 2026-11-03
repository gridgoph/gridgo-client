import { fireEvent, screen, waitFor } from "@testing-library/react-native";

import { useQuickActions } from "@/store/quickActions";
import { renderQuickActions, setUpQuickActions } from "@/test/quickActionsHarness";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
  router: { push: mockPush, replace: jest.fn(), back: jest.fn() },
}));
jest.mock("@/lib/api", () => jest.requireActual("@/test/quickActionsApiMock").quickActionsApiMock());

it("opens the quote request from its grid tile once the sheet has slid away", async () => {
  setUpQuickActions();
  await renderQuickActions();

  fireEvent.press(await screen.findByTestId("quick-action-quote"));

  await waitFor(() => expect(useQuickActions.getState().open).toBe(false));
  await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/quotes"));
});