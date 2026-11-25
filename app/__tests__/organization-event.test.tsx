import { screen } from "@testing-library/react-native";

import EventScreen from "@/app/organization/event/[id]";
import EventsScreen from "@/app/organization/events";
import { EVENT } from "@/test/organizationMembers";
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


beforeEach(() => {
  jest.clearAllMocks();
  signInOfficer();
  mockParams.current = { id: "ev_1" };
});

it("lists the event's orders with GRIDGO's total and both packs", async () => {
  await renderScreen(<EventScreen />);
  expect(await screen.findByText("2 orders · ₱2,450.00")).toBeOnTheScreen();
  expect(screen.getByText("Tarpaulin 4x8")).toBeOnTheScreen();
  expect(screen.getByLabelText("PDF for Sample Week")).toBeOnTheScreen();
  expect(screen.getByLabelText("CSV for Sample Week")).toBeOnTheScreen();
  expect(screen.getByText("Complete")).toBeOnTheScreen();
});

it("says which orders the pack leaves out", async () => {
  api.getOrganizationEvent.mockResolvedValue({
    ...EVENT,
    status: "open",
    orders: [EVENT.orders[0]!, { ...EVENT.orders[1]!, closed: false, state: "in_production" }],
  });
  await renderScreen(<EventScreen />);
  expect(await screen.findByText(/1 order is still in progress\./)).toBeOnTheScreen();
  expect(screen.getByText("Still in progress")).toBeOnTheScreen();
});

it("offers no pack with nothing to list", async () => {
  api.getOrganizationEvent.mockResolvedValue({ ...EVENT, status: "open", orders: EVENT.orders.map((order) => ({ ...order, closed: false })) });
  await renderScreen(<EventScreen />);
  expect(await screen.findByText(/The pack is ready once an order in this event is complete/)).toBeOnTheScreen();
  expect(screen.queryByLabelText("PDF for Sample Week")).toBeNull();
});

it("says an event could not load", async () => {
  api.getOrganizationEvent.mockRejectedValue(new Error("offline"));
  await renderScreen(<EventScreen />);
  expect(await screen.findByText("Event not loaded")).toBeOnTheScreen();
});

it("lists every event", async () => {
  await renderScreen(<EventsScreen />);
  expect(await screen.findByText("Sports Day")).toBeOnTheScreen();
  expect(screen.getByText("Add an event")).toBeOnTheScreen();
});

it("invites the first event", async () => {
  api.listOrganizationEvents.mockResolvedValue([]);
  await renderScreen(<EventsScreen />);
  expect(await screen.findByText("No events yet")).toBeOnTheScreen();
});
