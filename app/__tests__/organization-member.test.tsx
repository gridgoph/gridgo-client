import { fireEvent, screen } from "@testing-library/react-native";

import MemberScreen from "@/app/organization/member/[id]";
import { ApiError } from "@/lib/api";
import { EXPIRED } from "@/test/organizationMembers";
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
  mockParams.current = { id: "m_1" };
});

it("shows the date, orders and perks, and never what was ordered", async () => {
  await renderScreen(<MemberScreen />);
  expect(await screen.findByLabelText("Member since: Aug 2024")).toBeOnTheScreen();
  expect(screen.getByLabelText("Orders this term: 5")).toBeOnTheScreen();
  expect(screen.getByLabelText("Perks used: 1 of 3")).toBeOnTheScreen();
  expect(screen.getByText("Active · SY 2026-27 · 3 terms")).toBeOnTheScreen();
  expect(await screen.findByText("SAMPLE member")).toBeOnTheScreen();
  expect(screen.getByText("The label and perk stop right away. Past orders stay.")).toBeOnTheScreen();
  expect(screen.queryByText(/₱/)).toBeNull();
});

it("offers renewal for a member whose term ended, and no label", async () => {
  mockParams.current = { id: "m_old" };
  api.getMember.mockResolvedValue(EXPIRED);
  await renderScreen(<MemberScreen />);
  expect(await screen.findByText("Renew membership")).toBeOnTheScreen();
  expect(screen.getByText("Term ended")).toBeOnTheScreen();
  expect(screen.queryByText("SAMPLE member")).toBeNull();
});

it("says when they are no longer a member", async () => {
  api.getMember.mockRejectedValue(new ApiError(404, { error: "membership_not_found" }));
  await renderScreen(<MemberScreen />);
  expect(await screen.findByText("No longer a member")).toBeOnTheScreen();
});

it("says it could not load", async () => {
  api.getMember.mockRejectedValue(new Error("offline"));
  await renderScreen(<MemberScreen />);
  expect(await screen.findByText("Member not loaded")).toBeOnTheScreen();
});

it("asks, with what stops and what stays, before anyone is removed", async () => {
  await renderScreen(<MemberScreen />);
  await screen.findByText("SAMPLE member");
  await fireEvent.press(screen.getByText("Remove from SAMPLE"));
  expect(await screen.findByText("Remove Bea Example from SAMPLE?")).toBeOnTheScreen();
  expect(screen.getByText(/stop right away, and they are told\. Their past orders stay/)).toBeOnTheScreen();
  expect(api.removeMember).not.toHaveBeenCalled();
});
