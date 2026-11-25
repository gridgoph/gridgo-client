import { screen } from "@testing-library/react-native";

import PartnershipScreen from "@/app/organization/partnership";
import { PARTNERSHIP } from "@/test/organizationMembers";
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
});

it("shows GRIDGO's perk as read only and up to, results, records and benefits", async () => {
  await renderScreen(<PartnershipScreen />);
  expect(await screen.findByText("Up to ₱20.00 off an order")).toBeOnTheScreen();
  expect(screen.getByText("Set by GRIDGO")).toBeOnTheScreen();
  expect(screen.getByLabelText("Members who ordered: 18")).toBeOnTheScreen();
  expect(screen.getByLabelText("Members saved: ₱540.00")).toBeOnTheScreen();
  expect(screen.getByText("Sample Week")).toBeOnTheScreen();
  expect(screen.getByLabelText("Download pack for Sample Week")).toBeOnTheScreen();
  // Nothing complete to list yet: its own screen says what is ready.
  expect(screen.queryByLabelText("Download pack for Sports Day")).toBeNull();
  expect(screen.getByText(/not a tax document/)).toBeOnTheScreen();
  expect(screen.getByText("Partner badge on your organization")).toBeOnTheScreen();
  expect(screen.getByText("Hand over to a new officer")).toBeOnTheScreen();
});

it("never says the word fee", async () => {
  await renderScreen(<PartnershipScreen />);
  await screen.findByText("Up to ₱20.00 off an order");
  expect(screen.queryByText(/fee/i)).toBeNull();
});

it("is kind when there is no perk and no event", async () => {
  api.getPartnership.mockResolvedValue({ ...PARTNERSHIP, perk: null, events: [] });
  await renderScreen(<PartnershipScreen />);
  expect(await screen.findByText("No perk right now")).toBeOnTheScreen();
  expect(screen.getByText("No events yet")).toBeOnTheScreen();
});

it("says it could not load", async () => {
  api.getPartnership.mockRejectedValue(new Error("offline"));
  await renderScreen(<PartnershipScreen />);
  expect(await screen.findByText("Partnership not loaded")).toBeOnTheScreen();
});
