import { fireEvent, screen } from "@testing-library/react-native";

import RenewMembersScreen from "@/app/organization/renew";
import { EXPIRED, TERM } from "@/test/organizationMembers";
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
  api.listMembers.mockResolvedValue({ term: TERM, members: [EXPIRED], total: 1, nextCursor: null });
});

it("ticks nobody for the officer", async () => {
  await renderScreen(<RenewMembersScreen />);
  expect(await screen.findByRole("checkbox", { name: "Dana Testcase", checked: false })).toBeOnTheScreen();
  expect(screen.getByText("0 of 1 ticked")).toBeOnTheScreen();
  expect(screen.getByText("Member since Aug 2024 · 1 term · last SY 2025-26")).toBeOnTheScreen();
  expect(api.listMembers).toHaveBeenCalledWith({ status: "expired", limit: 200 });
});

it("says when there is nobody to renew", async () => {
  api.listMembers.mockResolvedValue({ term: TERM, members: [], total: 0, nextCursor: null });
  await renderScreen(<RenewMembersScreen />);
  expect(await screen.findByText("Nobody to renew")).toBeOnTheScreen();
});

it("says it could not load", async () => {
  api.listMembers.mockRejectedValue(new Error("offline"));
  await renderScreen(<RenewMembersScreen />);
  expect(await screen.findByText("Members not loaded")).toBeOnTheScreen();
});

it("names how many it will renew once ticked", async () => {
  await renderScreen(<RenewMembersScreen />);
  await fireEvent.press(await screen.findByRole("checkbox", { name: "Dana Testcase" }));
  expect(await screen.findByText("Renew 1 member")).toBeOnTheScreen();
});
