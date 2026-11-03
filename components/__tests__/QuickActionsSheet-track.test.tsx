import { fireEvent, screen } from "@testing-library/react-native";

import { useQuickActions } from "@/store/quickActions";
import { renderQuickActions, setUpQuickActions } from "@/test/quickActionsHarness";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
  router: { push: mockPush, replace: jest.fn(), back: jest.fn() },
}));
jest.mock("@/lib/api", () => jest.requireActual("@/test/quickActionsApiMock").quickActionsApiMock());

it("keeps Track order disabled, with its reason, while no order is in progress", async () => {
  setUpQuickActions();
  await renderQuickActions();

  const track = await screen.findByTestId("quick-action-track");
  expect(track.props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }));
  expect(await screen.findByText("No order in progress")).toBeTruthy();

  fireEvent.press(track);

  expect(useQuickActions.getState().open).toBe(true);
  expect(mockPush).not.toHaveBeenCalled();
});