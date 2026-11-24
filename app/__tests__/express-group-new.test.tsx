import { fireEvent, screen } from "@testing-library/react-native";

import NewGroupScreen from "@/app/express/group/new";
import * as api from "@/lib/api";
import { useExpressGroup } from "@/store/expressGroup";
import { renderScreen } from "@/test/renderScreen";

jest.mock("expo-router", () => {
  const { useEffect } = jest.requireActual("react");
  const router = { push: jest.fn(), replace: jest.fn(), canGoBack: () => true };
  return { useRouter: () => router, useFocusEffect: (effect: () => void) => useEffect(effect, [effect]) };
});
jest.mock("@/lib/api", () => ({
  ...jest.requireActual("@/lib/api"),
  listAddresses: jest.fn(),
  createExpressGroup: jest.fn(),
}));

const HOME = { id: "addr_1", label: "Home", addressLine: "City Hall, San Pedro St", isDefault: true, point: { lat: 7.06, lng: 125.6 } };

beforeEach(() => {
  useExpressGroup.getState().reset();
  jest.mocked(api.listAddresses).mockResolvedValue([HOME] as never);
});

// gridgo-client#450: the time limits are GRIDGO's three, 30 minutes chosen, and
// split payment is shown as coming, not offered.
it("offers GRIDGO's time limits and says split payment is not here yet", async () => {
  await renderScreen(<NewGroupScreen />);
  expect(await screen.findByText("30 min")).toBeTruthy();
  expect(screen.getByText("15 min")).toBeTruthy();
  expect(screen.getByText("60 min")).toBeTruthy();
  expect(screen.getByText("Coming soon")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Start group" }).props.accessibilityHint).toBe("Choose pick up or delivery.");
});

it("asks for pick up or delivery before starting", async () => {
  await renderScreen(<NewGroupScreen />);
  fireEvent.press(await screen.findByText("Start group"));
  expect(await screen.findByText("Choose pick up or delivery.")).toBeTruthy();
  expect(api.createExpressGroup).not.toHaveBeenCalled();
});
