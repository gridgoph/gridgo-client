import { fireEvent, screen } from "@testing-library/react-native";

import EventEditScreen from "@/app/organization/event-edit";
import type { Order } from "@/lib/api";
import { useOrganizationEvents } from "@/store/organizationEvents";
import { officerApi as api, renderScreen, signInOfficer } from "@/test/organizationScreens";

const mockPush = jest.fn();
const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockDismissTo = jest.fn();
const mockParams: { current: Record<string, string> } = { current: {} };

jest.mock("expo-router", () => ({
  router: {
    push: (...args: unknown[]) => mockPush(...args),
    back: (...args: unknown[]) => mockBack(...args),
    replace: (...args: unknown[]) => mockReplace(...args),
    dismissTo: (...args: unknown[]) => mockDismissTo(...args),
    navigate: jest.fn(),
  },
  useLocalSearchParams: () => mockParams.current,
  useFocusEffect: (effect: () => void | (() => void)) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useEffect } = require("react");
    useEffect(effect, [effect]);
  },
}));
jest.mock("@/lib/organizationMembersApi");


jest.mock("@/lib/api", () => ({ ...jest.requireActual("@/lib/api"), listOrders: jest.fn() }));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const appApi = require("@/lib/api");

beforeEach(() => {
  jest.clearAllMocks();
  signInOfficer();
  useOrganizationEvents.getState().startForm(null);
  appApi.listOrders.mockResolvedValue([
    { id: "ord_1", state: "completed", title: "Tarpaulin 4x8", totalMinor: 120000, createdAt: "2026-09-03T02:00:00Z", payments: [] },
  ] as unknown as Order[]);
});

it("lists the organization's own orders to tick", async () => {
  await renderScreen(<EventEditScreen />);
  expect(await screen.findByRole("checkbox", { name: "Tarpaulin 4x8", checked: false })).toBeOnTheScreen();
  expect(screen.getByText(/₱1,200\.00/)).toBeOnTheScreen();
});

it("lets the event be saved before there are orders", async () => {
  appApi.listOrders.mockResolvedValue([]);
  await renderScreen(<EventEditScreen />);
  expect(await screen.findByText(/add orders later/)).toBeOnTheScreen();
});

it("asks for a name first", async () => {
  await renderScreen(<EventEditScreen />);
  await screen.findByText("Tarpaulin 4x8");
  await fireEvent.press(screen.getByText("Save event"));
  expect(api.createOrganizationEvent).not.toHaveBeenCalled();
});
