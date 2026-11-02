import { act, screen, waitFor } from "@testing-library/react-native";
import { PanResponder, type PanResponderCallbacks } from "react-native";

import { useQuickActions } from "@/store/quickActions";
import { renderQuickActions, setUpQuickActions } from "@/test/quickActionsHarness";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
  router: { push: mockPush, replace: jest.fn(), back: jest.fn() },
}));
jest.mock("@/lib/api", () => jest.requireActual("@/test/quickActionsApiMock").quickActionsApiMock());

it("closes on a swipe down", async () => {
  const configs: PanResponderCallbacks[] = [];
  const create = PanResponder.create.bind(PanResponder);
  jest.spyOn(PanResponder, "create").mockImplementation((config) => {
    configs.push(config);
    return create(config);
  });
  setUpQuickActions();
  await renderQuickActions();
  expect(await screen.findByTestId("quick-actions-sheet")).toBeTruthy();

  const drag = configs[configs.length - 1];
  const gesture = { dx: 0, dy: 300, vx: 0, vy: 2 } as never;
  await act(async () => {
    drag.onPanResponderGrant?.({} as never, gesture);
    drag.onPanResponderMove?.({} as never, gesture);
    drag.onPanResponderRelease?.({} as never, gesture);
  });

  await waitFor(() => expect(useQuickActions.getState().open).toBe(false));
  await waitFor(() => expect(screen.queryByTestId("quick-actions-sheet")).toBeNull());
});
