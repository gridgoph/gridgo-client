import { fireEvent, screen } from "@testing-library/react-native";

import WaitingScreen from "@/app/organization/waiting";
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

const waiting = () =>
  api.getMemberListEntries.mockResolvedValue({
    entries: [
      { id: "e1", name: "Alex Sample", contactKind: "email", contact: "alex@example.com", memberSince: "2024-08-01", expiresAt: "2026-12-26T00:00:00Z" },
    ],
    nextCursor: null,
    counts: { waiting: 1, accepted: 4, dismissed: 0, expired: 0, removed: 0 },
  });

it("says nobody is waiting and how to invite", async () => {
  await renderScreen(<WaitingScreen />);
  expect(await screen.findByText("Nobody is waiting")).toBeOnTheScreen();
});

it("says it could not load", async () => {
  api.getMemberListEntries.mockRejectedValue(new Error("offline"));
  await renderScreen(<WaitingScreen />);
  expect(await screen.findByText("List not loaded")).toBeOnTheScreen();
});

it("lists who has not answered, and asks before taking one off", async () => {
  waiting();
  await renderScreen(<WaitingScreen />);
  expect(await screen.findByText("1 person waiting")).toBeOnTheScreen();
  expect(screen.getByText(/^4 people from your list confirmed\./)).toBeOnTheScreen();
  await fireEvent.press(screen.getByLabelText("Take Alex Sample off the list"));
  expect(await screen.findByText("Take Alex Sample off the list?")).toBeOnTheScreen();
  expect(api.removeMemberListEntry).not.toHaveBeenCalled();
});
