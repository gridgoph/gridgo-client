import { fireEvent, screen, waitFor } from "@testing-library/react-native";

import { startPrintHref } from "@/lib/startPrint";
import { useQuickActions } from "@/store/quickActions";
import { renderQuickActions, setUpQuickActions } from "@/test/quickActionsHarness";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
  router: { push: mockPush, replace: jest.fn(), back: jest.fn() },
}));
jest.mock("@/lib/api", () => jest.requireActual("@/test/quickActionsApiMock").quickActionsApiMock());

it("starts a new print from the full-width yellow action", async () => {
  setUpQuickActions();
  await renderQuickActions();

  fireEvent.press(await screen.findByLabelText(/^Start a new print/));

  await waitFor(() => expect(useQuickActions.getState().open).toBe(false));
  await waitFor(() => expect(mockPush).toHaveBeenCalledWith(startPrintHref()));
});